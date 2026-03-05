const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');
const { invalidateCache } = require('../middleware/cache.middleware');
const { createNotification } = require('../utils/notificationHelper');
const { canViewDirectContact } = require('../utils/subscriptionAccess');

/**
 * POST /api/applications — Job seeker applies (auth required → 401 triggers login modal)
 */
const createApplication = asyncHandler(async (req, res) => {
    const { jobId, coverLetter,resumeUrl } = req.body;

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
        select: { name: true, resumeUrl: true },
    });
    const applicationResumeUrl = resumeUrl || user?.resumeUrl;

    if (!applicationResumeUrl) {
        throw ApiError.badRequest('A resume is required to apply for this job');
    }

    // Create application
    const application = await prisma.application.create({
        data: {
            jobId,
            userId: req.user.id,
            applicantName: user?.name,
            resumeUrl: applicationResumeUrl,
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

    // Create notification for recruiter (DB + socket + push)
    await createNotification({
        userId: job.postedById,
        title: 'New Application',
        message: `${user?.name || 'Someone'} applied for ${job.title}`,
        type: 'application',
        metadata: { jobId: job.id, applicationId: application.id },
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
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        profileImage: true,
                        headline: true,
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
                    about: true,
                    summary: true,
                    linkedIn: true,
                    github: true,
                    portfolio: true,
                    noticePeriod: true,
                    expectedSalary: true,
                    workExperience: true,
                    education: true,
                },
            },
        },
    });

    if (!application) throw ApiError.notFound('Application not found');

    // Only applicant or job poster can view
    if (application.userId !== req.user.id && application.job.postedById !== req.user.id) {
        throw ApiError.forbidden('Access denied');
    }

    let responseData = application;
    if (application.job.postedById === req.user.id) {
        const recruiter = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { company: true },
        });

        if (!canViewDirectContact(recruiter?.company)) {
            responseData = {
                ...application,
                user: application.user
                    ? {
                        ...application.user,
                        email: null,
                        phone: null,
                    }
                    : application.user,
            };
        }
    }

    res.json({
        success: true,
        data: responseData,
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

    const recruiter = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });
    const allowDirectContact = canViewDirectContact(recruiter?.company);

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
                        currentDesignation: true,
                        about: true,
                        summary: true,
                        linkedIn: true,
                        github: true,
                        portfolio: true,
                        noticePeriod: true,
                        expectedSalary: true,
                        workExperience: true,
                        education: true,
                    },
                },
            },
        }),
        prisma.application.count({ where }),
    ]);

    const sanitizedApplications = allowDirectContact
        ? applications
        : applications.map((application) => ({
            ...application,
            user: application.user
                ? {
                    ...application.user,
                    email: null,
                    phone: null,
                }
                : application.user,
        }));

    res.json({
        success: true,
        data: sanitizedApplications,
        access: {
            canViewDirectContact: allowDirectContact,
        },
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

    await createNotification({
        userId: application.userId,
        title: 'Application Update',
        message: `Your application for ${application.job.title} ${statusLabels[status] || 'has been updated'}`,
        type: 'application',
        metadata: { applicationId: application.id, jobId: application.jobId },
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
