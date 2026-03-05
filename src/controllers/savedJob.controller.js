const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { invalidateCache } = require('../middleware/cache.middleware');
const { paginate, paginationMeta } = require('../utils/pagination');

/**
 * POST /api/saved-jobs/:jobId — Toggle save/unsave job
 */
const toggleSavedJob = asyncHandler(async (req, res) => {
    // Role check (redundant if route has roleGuard, but good for safety)
    if (req.user.role !== 'job_seeker') {
        throw ApiError.forbidden('Only job seekers can save jobs');
    }

    const { jobId } = req.params;
    const userId = req.user.id;

    // Check if already saved
    const existing = await prisma.savedJob.findUnique({
        where: { userId_jobId: { userId, jobId } },
    });

    if (existing) {
        // Unsave
        await prisma.savedJob.delete({
            where: { userId_jobId: { userId, jobId } },
        });
        await invalidateCache(`saved:${userId}`); // Invalidate cache
        return res.json({ success: true, message: 'Job removed from saved', isSaved: false });
    } else {
        // Save
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) throw ApiError.notFound('Job not found');

        await prisma.savedJob.create({
            data: { userId, jobId },
        });
        await invalidateCache(`saved:${userId}`); // Invalidate cache
        return res.status(201).json({ success: true, message: 'Job saved', isSaved: true });
    }
});

/**
 * GET /api/saved-jobs — List saved jobs (paginated)
 */
const getSavedJobs = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { skip, take, page, limit } = paginate(req.query);

    const [savedJobs, total] = await Promise.all([
        prisma.savedJob.findMany({
            where: { userId },
            orderBy: { savedAt: 'desc' },
            skip,
            take,
            include: {
                job: {
                    include: {
                        company: true,
                        postedBy: {
                            select: { id: true, name: true, profileImage: true },
                        },
                    },
                },
            },
        }),
        prisma.savedJob.count({ where: { userId } }),
    ]);

    // Check application status for these jobs
    const applications = await prisma.application.findMany({
        where: { userId },
        select: { jobId: true },
    });
    const appliedJobIds = new Set(applications.map(a => a.jobId));

    const data = savedJobs.map((s) => ({
        ...s.job,
        isSaved: true,
        hasApplied: appliedJobIds.has(s.jobId),
    }));

    const response = { success: true, data, pagination: paginationMeta(total, page, limit) };

    res.json(response);
});

module.exports = { toggleSavedJob, getSavedJobs };
