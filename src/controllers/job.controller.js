const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');
const { redis } = require('../config/redis');

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
            userSkills = user.skills || [];
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
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { companyName: { contains: search, mode: 'insensitive' } },
            { skills: { hasSome: [search] } },
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

    const [jobs, total] = await Promise.all([
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

    // Raw SQL for Full-Text Search
    const jobs = await prisma.$queryRaw`
        SELECT id, title, description, company_name as "companyName", location, "salary_min" as "salaryMin", "salary_max" as "salaryMax", 
               "posted_date" as "postedDate", "company_logo" as "companyLogo", "job_type" as "jobType", "company_id" as "companyId"
        FROM jobs
        WHERE status = 'active' 
          AND "is_deleted" = false
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

    if (!data.title || !data.description) {
        throw ApiError.badRequest('title and description are required');
    }

    const job = await prisma.job.create({
        data: {
            ...data,
            postedById: req.user.id,
            companyId: req.user.companyId || null,
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

    const updated = await prisma.job.update({
        where: { id: req.params.id },
        data: req.body,
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
