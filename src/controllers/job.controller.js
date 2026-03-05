const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');
const { redis } = require('../config/redis');
const { isCompanyProfileComplete } = require('../utils/companyProfile');
const { normalizeSkillList, expandSkillQueryToCanonicalSkills } = require('../utils/skillNormalization');

const CACHE_TTL = 300; // 5 minutes

/**
 * GET /api/jobs — Public (guest OK)
 * List jobs with filters, search, sort, pagination
 */
const getJobs = asyncHandler(async (req, res) => {
    const { search, location, jobType, isRemote, minExperience, maxExperience, status, sortBy, sortOrder, page, limit } = req.query;

    let userAppliedJobIds = [];
    let userSkills = [];
    if (req.user) {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { skills: true, applications: { select: { jobId: true } } }
        });
        if (user) {
            userAppliedJobIds = user.applications.map(a => a.jobId);
            userSkills = await normalizeSkillList(user.skills || [], {
                createMissing: false,
                incrementUsage: false,
            });
        }
    }

    // Build cache key (Function of query AND user identity)
    const userKey = req.user ? `user:${req.user.id}` : 'public';
    const cacheKey = `jobs:${userKey}:${JSON.stringify(req.query)}`;

    if (redis) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        } catch {
            // Redis down, continue without cache
        }
    }

    // Build where clause
    const where = { status: status || 'active', isDeleted: false };

    // Self-healing: Link orphaned jobs to companies by name
    try {
        await prisma.$executeRaw`
            UPDATE jobs j
            SET company_id = c.id
            FROM companies c
            WHERE j.company_name = c.name
              AND j.company_id IS NULL;
        `;
    } catch (e) {
        // Silently fail if DB issue, don't block page load
    }

    // 1. Exclude applied jobs for authenticated users
    if (userAppliedJobIds.length > 0) {
        where.id = { notIn: userAppliedJobIds };
    }

    // 2. Filter by skills (Personalized Feed)
    // Only apply skill filter if:
    // a) User is authenticated and has skills
    // b) No specific 'search' query is provided (User wants recommendations, not search results)
    if (userSkills.length > 0 && !search) {
        where.skills = { hasSome: userSkills };
    }

    if (search) {
        const matchedSkills = await expandSkillQueryToCanonicalSkills(search, {
            limitPerToken: 10,
        });
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { companyName: { contains: search, mode: 'insensitive' } },
            ...(matchedSkills.length > 0 ? [{ skills: { hasSome: matchedSkills } }] : []),
        ];
    }

    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (jobType) where.jobType = jobType;
    if (isRemote !== undefined) where.isRemote = isRemote === 'true';
    if (minExperience) where.minExperience = { gte: parseInt(minExperience) };
    if (maxExperience) where.maxExperience = { lte: parseInt(maxExperience) };

    // Sorting
    const orderBy = {};
    if (sortBy === 'salary') orderBy.salaryMin = sortOrder || 'desc';
    else if (sortBy === 'applicants') orderBy.applicants = sortOrder || 'desc';
    else orderBy.postedDate = sortOrder || 'desc';

    const pagination = paginate(req.query);

    let [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy,
            skip: pagination.skip,
            take: pagination.take,
            include: {
                company: {
                    select: { id: true, name: true, logo: true, rating: true },
                },
            },
        }),
        prisma.job.count({ where }),
    ]);

    // Fallback: If personalized feed yields 0 results, show all jobs instead
    if (jobs.length === 0 && userSkills.length > 0 && !search) {
        delete where.skills;
        const [fallbackJobs, fallbackTotal] = await Promise.all([
            prisma.job.findMany({
                where,
                orderBy,
                skip: pagination.skip,
                take: pagination.take,
                include: {
                    company: {
                        select: { id: true, name: true, logo: true, rating: true },
                    },
                },
            }),
            prisma.job.count({ where }),
        ]);
        jobs = fallbackJobs;
        total = fallbackTotal;
    }

    const response = {
        success: true,
        data: jobs,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    };

    // Cache the response
    if (redis) {
        try {
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));
        } catch {
            // Redis down, continue
        }
    }

    res.json(response);
});

/**
 * GET /api/jobs/:id — Public (guest OK)
 */
const getJobById = asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: {
            company: true,
            postedBy: {
                select: { id: true, name: true, profileImage: true },
            },
        },
    });

    if (!job) throw ApiError.notFound('Job not found');

    // Increment view count
    await prisma.job.update({
        where: { id: req.params.id },
        data: { views: { increment: 1 } },
    });

    // Check if current user saved/applied
    let isSaved = false;
    let hasApplied = false;
    if (req.user) {
        const [saved, application] = await Promise.all([
            prisma.savedJob.findUnique({
                where: { userId_jobId: { userId: req.user.id, jobId: job.id } },
            }),
            prisma.application.findUnique({
                where: { jobId_userId: { jobId: job.id, userId: req.user.id } },
            }),
        ]);
        isSaved = !!saved;
        hasApplied = !!application;
    }

    res.json({
        success: true,
        data: { ...job, isSaved, hasApplied },
    });
});

/**
 * GET /api/jobs/search — Public (guest OK)
 */
/**
 * GET /api/jobs/search — Public (guest OK)
 * Optimized with PostgreSQL Full-Text Search
 */
const searchJobs = asyncHandler(async (req, res) => {
    const { q, page, limit } = req.query;

    if (!q || q.trim().length < 2) {
        throw ApiError.badRequest('Search query must be at least 2 characters');
    }

    const searchQuery = q.trim().split(/\s+/).join(' & '); // "React Native" -> "React & Native"
    const pagination = paginate(req.query);

    // Get user's applied job IDs to exclude them
    let excludeJobIds = [];
    if (req.user) {
        const applications = await prisma.application.findMany({
            where: { userId: req.user.id },
            select: { jobId: true }
        });
        excludeJobIds = applications.map(app => app.jobId);
    }

    // Raw SQL for Full-Text Search
    const jobs = await prisma.$queryRaw`
        SELECT id, title, description, company_name as "companyName", location, "salary_min" as "salaryMin", "salary_max" as "salaryMax", 
               "posted_date" as "postedDate", "company_logo" as "companyLogo", "job_type" as "jobType", "company_id" as "companyId"
        FROM jobs
        WHERE status = 'active' 
          AND "is_deleted" = false
          ${excludeJobIds.length > 0 ? prisma.raw(`AND id NOT IN (${excludeJobIds.map(id => `'${id}'`).join(',')})`) : prisma.raw('')}
          AND "search_vector" @@ to_tsquery('english', ${searchQuery})
        ORDER BY ts_rank("search_vector", to_tsquery('english', ${searchQuery})) DESC
        LIMIT ${pagination.take} OFFSET ${pagination.skip};
    `;

    // Count total for pagination
    const totalResult = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM jobs
        WHERE status = 'active' 
          AND "is_deleted" = false
          ${excludeJobIds.length > 0 ? prisma.raw(`AND id NOT IN (${excludeJobIds.map(id => `'${id}'`).join(',')})`) : prisma.raw('')}
          AND "search_vector" @@ to_tsquery('english', ${searchQuery});
    `;

    const total = Number(totalResult[0]?.count || 0);

    res.json({
        success: true,
        data: jobs,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    });
});

/**
 * POST /api/recruiter/jobs — Recruiter only
 */
const createJob = asyncHandler(async (req, res) => {
    const data = req.body;

    // ── Subscription Guard ──────────────────────────────────
    const recruiter = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });

    if (!recruiter.companyId || !recruiter.company) {
        throw ApiError.forbidden('You must create a company profile before posting jobs');
    }

    if (!isCompanyProfileComplete(recruiter.company)) {
        throw ApiError.forbidden('Complete your company profile before posting jobs');
    }

    const { subscriptionStatus, trialEndsAt } = recruiter.company;
    const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
    const isExpired = trialEndsAt && new Date(trialEndsAt) < new Date();

    if (!isActive || isExpired) {
        throw ApiError.forbidden('An active subscription is required to post jobs. Please subscribe first.');
    }

    if (!data.title || !data.description) {
        throw ApiError.badRequest('title and description are required');
    }

    if (data.skills) {
        data.skills = await normalizeSkillList(data.skills, {
            createMissing: true,
            incrementUsage: true,
        });
    }

    // Normalize requirements & benefits to String[] arrays
    if (data.requirements && typeof data.requirements === 'string') {
        data.requirements = data.requirements.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (data.benefits && typeof data.benefits === 'string') {
        data.benefits = data.benefits.split(',').map(s => s.trim()).filter(Boolean);
    }

    const { company } = recruiter;
    const job = await prisma.job.create({
        data: {
            ...data,
            postedById: req.user.id,
            companyId: company.id,
            companyName: data.companyName || company.name,
            companyLogo: data.companyLogo || company.logo || null,
            companyDescription: data.companyDescription || company.description || null,
        },
    });

    // Invalidate cache
    if (redis) {
        try {
            const keys = await redis.keys('jobs:*');
            if (keys.length > 0) await redis.del(...keys);
        } catch {
            // Redis down
        }
    }

    res.status(201).json({
        success: true,
        message: 'Job posted successfully',
        data: job,
    });
});

/**
 * GET /api/recruiter/jobs — Recruiter's own jobs
 */
const getRecruiterJobs = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const pagination = paginate(req.query);

    const where = { postedById: req.user.id };
    if (status) where.status = status;

    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
            include: {
                _count: { select: { applications: true } },
            },
        }),
        prisma.job.count({ where }),
    ]);

    res.json({
        success: true,
        data: jobs,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    });
});

/**
 * PATCH /api/recruiter/jobs/:id — Update job
 */
const updateJob = asyncHandler(async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        throw ApiError.badRequest('No fields to update');
    }

    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) throw ApiError.notFound('Job not found');
    if (job.postedById !== req.user.id) throw ApiError.forbidden('Not your job');

    const updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'skills')) {
        updateData.skills = await normalizeSkillList(updateData.skills, {
            createMissing: true,
            incrementUsage: true,
        });
    }

    const updated = await prisma.job.update({
        where: { id: req.params.id },
        data: updateData,
    });

    // Invalidate cache
    if (redis) {
        try {
            const keys = await redis.keys('jobs:*');
            if (keys.length > 0) await redis.del(...keys);
        } catch { }
    }

    res.json({
        success: true,
        message: 'Job updated',
        data: updated,
    });
});

/**
 * DELETE /api/recruiter/jobs/:id
 */
const deleteJob = asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) throw ApiError.notFound('Job not found');
    if (job.postedById !== req.user.id) throw ApiError.forbidden('Not your job');

    await prisma.job.update({ where: { id: req.params.id }, data: { isDeleted: true } });

    // Invalidate cache
    if (redis) {
        try {
            const keys = await redis.keys('jobs:*');
            if (keys.length > 0) await redis.del(...keys);
        } catch { }
    }

    res.json({
        success: true,
        message: 'Job deleted',
    });
});

module.exports = {
    getJobs,
    getJobById,
    searchJobs,
    createJob,
    getRecruiterJobs,
    updateJob,
    deleteJob,
};
