const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');
const { invalidateCache } = require('../middleware/cache.middleware');

/**
 * POST /api/applications — Job seeker applies (auth required → 401 triggers login modal)
 */
const createApplication = asyncHandler(async (req, res) => {
    const { jobId, coverLetter } = req.body;

    if (!jobId) {
        throw ApiError.badRequest('jobId is required');
    }

    // Check job exists and is active
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw ApiError.notFound('Job not found');
    if (job.status !== 'active') throw ApiError.badRequest('This job is no longer accepting applications');

    // Check for duplicate application
    const existing = await prisma.application.findUnique({
        where: { jobId_userId: { jobId, userId: req.user.id } },
    });
    if (existing) throw ApiError.conflict('You have already applied for this job');

    // Get user for applicant name
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { name: true },
    });

    // Create application
    const application = await prisma.application.create({
        data: {
            jobId,
            userId: req.user.id,
            applicantName: user?.name,
            coverLetter,
        },
        include: {
            job: {
                select: {
                    id: true,
                    title: true,
                    companyName: true,
                    companyLogo: true,
                    location: true,
                },
            },
        },
    });

    // Increment job applicant count
    await prisma.job.update({
        where: { id: jobId },
        data: { applicants: { increment: 1 } },
    });

    // Create notification for recruiter
    await prisma.notification.create({
        data: {
            userId: job.postedById,
            title: 'New Application',
            message: `${user?.name || 'Someone'} applied for ${job.title}`,
            type: 'application',
            metadata: { jobId: job.id, applicationId: application.id },
        },
    });

    await invalidateCache(`apps:user:${req.user.id}`);
    await invalidateCache(`apps:job:${jobId}`);

    res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        data: application,
    });
});

/**
 * GET /api/applications — Job seeker's applications
 */
const getMyApplications = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const pagination = paginate(req.query);
    const userId = req.user.id;

    // Cache key includes filters
    const cacheKey = `apps:user:${userId}:${JSON.stringify(req.query)}`;

    // Try cache
    if (require('../config/redis').redis) {
        try {
            const cached = await require('../config/redis').redis.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));
        } catch { }
    }

    const where = { userId };
    if (status) where.status = status;

    const [applications, total] = await Promise.all([
        prisma.application.findMany({
            where,
            orderBy: { appliedDate: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        companyName: true,
                        companyLogo: true,
                        location: true,
                        jobType: true,
                        salaryMin: true,
                        salaryMax: true,
                    },
                },
            },
        }),
        prisma.application.count({ where }),
    ]);

    const response = {
        success: true,
        data: applications,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    };

    // Set cache
    if (require('../config/redis').redis) {
        try {
            await require('../config/redis').redis.setex(cacheKey, 60, JSON.stringify(response)); // 1 min cache for apps
        } catch { }
    }

    res.json(response);
});

/**
 * GET /api/applications/:id
 */
const getApplicationById = asyncHandler(async (req, res) => {
    const application = await prisma.application.findUnique({
        where: { id: req.params.id },
        include: {
            job: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    profileImage: true,
                    headline: true,
                    location: true,
                    experience: true,
                    skills: true,
                    resumeUrl: true,
                    currentCompany: true,
                    currentDesignation: true,
                },
            },
        },
    });

    if (!application) throw ApiError.notFound('Application not found');

    // Only applicant or job poster can view
    if (application.userId !== req.user.id && application.job.postedById !== req.user.id) {
        throw ApiError.forbidden('Access denied');
    }

    res.json({
        success: true,
        data: application,
    });
});

/**
 * GET /api/recruiter/jobs/:jobId/applications — Applications for a specific job
 */
const getJobApplications = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const pagination = paginate(req.query);

    // Verify job belongs to recruiter
    const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
    if (!job) throw ApiError.notFound('Job not found');
    if (job.postedById !== req.user.id) throw ApiError.forbidden('Not your job');

    const where = { jobId: req.params.jobId };
    if (status) where.status = status;

    const [applications, total] = await Promise.all([
        prisma.application.findMany({
            where,
            orderBy: { appliedDate: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        profileImage: true,
                        headline: true,
                        location: true,
                        experience: true,
                        skills: true,
                        resumeUrl: true,
                        currentCompany: true,
                    },
                },
            },
        }),
        prisma.application.count({ where }),
    ]);

    res.json({
        success: true,
        data: applications,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    });
});

/**
 * PATCH /api/recruiter/applications/:id/status — Update application status
 */
const updateApplicationStatus = asyncHandler(async (req, res) => {
    const { status, recruiterMessage } = req.body;

    if (!status) {
        throw ApiError.badRequest('status is required');
    }

    const application = await prisma.application.findUnique({
        where: { id: req.params.id },
        include: { job: true },
    });

    if (!application) throw ApiError.notFound('Application not found');
    if (application.job.postedById !== req.user.id) throw ApiError.forbidden('Not your application');
    if (application.status === 'withdrawn') throw ApiError.badRequest('Cannot update a withdrawn application');
    if (application.status === 'hired') throw ApiError.badRequest('Cannot update a hired application');
    if (application.status === status) throw ApiError.badRequest('Status is already set to this value');


    const updated = await prisma.application.update({
        where: { id: req.params.id },
        data: { status, recruiterMessage },
    });

    // Notify applicant
    const statusLabels = {
        in_review: 'is being reviewed',
        shortlisted: 'has been shortlisted',
        interviewed: 'interview scheduled',
        offered: 'has received an offer',
        rejected: 'was not selected',
        hired: 'has been accepted',
    };

    await prisma.notification.create({
        data: {
            userId: application.userId,
            title: 'Application Update',
            message: `Your application for ${application.job.title} ${statusLabels[status] || 'has been updated'}`,
            type: 'application',
            metadata: { applicationId: application.id, jobId: application.jobId },
        },
    });

    await invalidateCache(`apps:user:${application.userId}`);
    await invalidateCache(`apps:job:${application.jobId}`);

    res.json({
        success: true,
        message: 'Application status updated',
        data: updated,
    });
});

/**
 * DELETE /api/applications/:id — Withdraw application (job seeker)
 */
const withdrawApplication = asyncHandler(async (req, res) => {
    const application = await prisma.application.findUnique({
        where: { id: req.params.id },
    });

    if (!application) throw ApiError.notFound('Application not found');
    if (application.userId !== req.user.id) throw ApiError.forbidden('Not your application');
    if (application.status === 'withdrawn') throw ApiError.badRequest('Application already withdrawn');
    if (application.status !== 'applied') throw ApiError.badRequest('Cannot withdraw a non-applied application');

    await prisma.application.update({
        where: { id: req.params.id },
        data: { status: 'withdrawn' },
    });

    // Decrement applicant count
    await prisma.job.update({
        where: { id: application.jobId },
        data: { applicants: { decrement: 1 } },
    });

    await invalidateCache(`apps:user:${req.user.id}`);
    await invalidateCache(`apps:job:${application.jobId}`);

    res.json({
        success: true,
        message: 'Application withdrawn',
    });
});

module.exports = {
    createApplication,
    getMyApplications,
    getApplicationById,
    getJobApplications,
    updateApplicationStatus,
    withdrawApplication,
};
