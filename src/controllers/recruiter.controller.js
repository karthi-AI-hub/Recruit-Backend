const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isCompanyProfileComplete } = require('../utils/companyProfile');
const { hasActiveSubscription, canAccessAnalytics, canViewDirectContact } = require('../utils/subscriptionAccess');
const { expandSkillQueryToCanonicalSkills, normalizeSkillList } = require('../utils/skillNormalization');

/**
 * GET /api/recruiter/dashboard — Dashboard metrics
 */
const getDashboard = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Parallel queries for dashboard data
    const [
        totalJobs,
        activeJobs,
        totalApplications,
        applicationsByStatus,
        recentApplications,
        topJobs,
    ] = await Promise.all([
        // Total jobs posted
        prisma.job.count({ where: { postedById: userId } }),

        // Active jobs
        prisma.job.count({ where: { postedById: userId, status: 'active' } }),

        // Total applications across all jobs
        prisma.application.count({
            where: { job: { postedById: userId } },
        }),

        // Applications grouped by status
        prisma.application.groupBy({
            by: ['status'],
            where: { job: { postedById: userId } },
            _count: true,
        }),

        // Recent applications (last 10)
        prisma.application.findMany({
            where: { job: { postedById: userId } },
            orderBy: { appliedDate: 'desc' },
            take: 10,
            include: {
                user: {
                    select: { id: true, name: true, profileImage: true, headline: true },
                },
                job: {
                    select: { id: true, title: true, companyName: true },
                },
            },
        }),

        // Top performing jobs (by applicant count)
        prisma.job.findMany({
            where: { postedById: userId },
            orderBy: { applicants: 'desc' },
            take: 5,
            select: {
                id: true,
                title: true,
                applicants: true,
                views: true,
                status: true,
                postedDate: true,
            },
        }),
    ]);

    // Build status breakdown
    const statusBreakdown = {};
    applicationsByStatus.forEach((item) => {
        statusBreakdown[item.status] = item._count;
    });

    // Application trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyApplications = await prisma.$queryRaw`
    SELECT DATE(applied_date) as date, COUNT(*)::int as count
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE j.posted_by_id = ${userId}
      AND a.applied_date >= ${sevenDaysAgo}
    GROUP BY DATE(applied_date)
    ORDER BY date ASC
  `;

    res.json({
        success: true,
        data: {
            metrics: {
                totalJobs,
                activeJobs,
                totalApplications,
                statusBreakdown,
            },
            recentApplications,
            topJobs,
            applicationTrend: dailyApplications,
        },
    });
});

/**
 * GET /api/recruiter/analytics — Detailed analytics
 */
const getAnalytics = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { period } = req.query;

    const recruiter = await prisma.user.findUnique({
        where: { id: userId },
        include: { company: true },
    });

    if (!recruiter.companyId || !recruiter.company) {
        throw ApiError.forbidden('You must create a company profile before accessing analytics');
    }

    if (!isCompanyProfileComplete(recruiter.company)) {
        throw ApiError.forbidden('Complete your company profile before accessing analytics');
    }

    if (!hasActiveSubscription(recruiter.company)) {
        throw ApiError.forbidden('An active subscription is required to access analytics');
    }

    if (!canAccessAnalytics(recruiter.company)) {
        throw ApiError.forbidden('Analytics is available on Premium and Custom plans only');
    }

    // Default to 30 days if not specified or invalid
    let days = 30;
    if (period === '7d' || period === 'This Week') days = 7;
    else if (period === '30d' || period === 'This Month') days = 30;
    else if (period === '90d' || period === 'Last 3 Months') days = 90;
    else if (period === '365d' || period === 'This Year') days = 365;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [monthlyTrend, conversionRates, topSkills] = await Promise.all([
        prisma.$queryRaw`
      SELECT DATE(applied_date) as date, COUNT(*)::int as count
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE j.posted_by_id = ${userId}
        AND a.applied_date >= ${startDate}
      GROUP BY DATE(applied_date)
      ORDER BY date ASC
    `,
        // Conversion funnel
        prisma.application.groupBy({
            by: ['status'],
            where: {
                job: { postedById: userId },
                appliedDate: { gte: startDate }
            },
            _count: true,
        }),
        // Most requested skills
        prisma.$queryRaw`
      SELECT unnest(skills) as skill, COUNT(*)::int as count
      FROM jobs
      WHERE posted_by_id = ${userId}
      GROUP BY skill
      ORDER BY count DESC
      LIMIT 10
    `,
    ]);

    // Ensure all 6 key funnel stages are present even with 0 count
    const funnelStages = [
        'applied',
        'inReview',
        'shortlisted',
        'interviewed',
        'offered',
        'hired'
    ];

    const conversionFunnel = funnelStages.map(status => {
        const found = conversionRates.find(c => c.status === status);
        return {
            status,
            count: found ? found._count : 0
        };
    });

    res.json({
        success: true,
        data: {
            monthlyTrend: monthlyTrend.map(t => ({
                ...t,
                date: t.date.toISOString().split('T')[0] // Ensure consistent date string
            })),
            conversionFunnel,
            topSkills,
        },
    });
});

/**
 * GET /api/recruiter/company — Recruiter's own company profile
 */
const getOwnCompanyProfile = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });

    if (!user || user.role !== 'recruiter') {
        throw ApiError.forbidden('Only recruiters can access company profile');
    }

    if (!user.companyId || !user.company) {
        return res.json({
            success: true,
            data: {
                hasCompany: false,
                isProfileComplete: false,
            },
        });
    }

    res.json({
        success: true,
        data: {
            hasCompany: true,
            isProfileComplete: isCompanyProfileComplete(user.company),
            company: user.company,
        },
    });
});

/**
 * GET /api/recruiter/candidates — Search candidates
 */
const searchCandidates = asyncHandler(async (req, res) => {
    const { search, skills, location, minExperience, maxExperience, page, limit } = req.query;

    // ── Subscription Guard ──────────────────────────────────
    const recruiter = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });

    if (!recruiter.companyId || !recruiter.company) {
        throw ApiError.forbidden('You must create a company profile before searching candidates');
    }

    if (!isCompanyProfileComplete(recruiter.company)) {
        throw ApiError.forbidden('Complete your company profile before searching candidates');
    }

    if (!hasActiveSubscription(recruiter.company)) {
        throw ApiError.forbidden('An active subscription is required to search candidates. Please subscribe first.');
    }

    const allowDirectContact = canViewDirectContact(recruiter.company);

    const where = { role: 'job_seeker', isProfileHidden: false };
    const matchedSearchSkills = search
        ? await expandSkillQueryToCanonicalSkills(search, { limitPerToken: 10 })
        : [];

    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { headline: { contains: search, mode: 'insensitive' } },
            { currentDesignation: { contains: search, mode: 'insensitive' } },
            ...(matchedSearchSkills.length > 0
                ? [{ skills: { hasSome: matchedSearchSkills } }]
                : []),
        ];
    }

    if (skills) {
        let skillList = await expandSkillQueryToCanonicalSkills(skills, {
            limitPerToken: 12,
        });
        if (skillList.length === 0) {
            skillList = await normalizeSkillList(skills, {
                createMissing: false,
                incrementUsage: false,
            });
        }
        if (skillList.length > 0) {
            where.skills = { hasSome: skillList };
        }
    }

    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (minExperience) where.experience = { ...where.experience, gte: parseInt(minExperience) };
    if (maxExperience) where.experience = { ...where.experience, lte: parseInt(maxExperience) };

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const [candidates, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip,
            take: limitNum,
            select: {
                id: true,
                name: true,
                email: true,
                profileImage: true,
                headline: true,
                location: true,
                experience: true,
                skills: true,
                currentCompany: true,
                currentDesignation: true,
                isAvailable: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
    ]);

    const maskedCandidates = allowDirectContact
        ? candidates
        : candidates.map((candidate) => ({
            ...candidate,
            email: null,
        }));

    res.json({
        success: true,
        data: maskedCandidates,
        access: {
            canViewDirectContact: allowDirectContact,
            plan: recruiter.company.subscriptionPlan,
        },
        pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    });
});


/**
 * PUT /api/recruiter/company — Update or create company profile
 */
const updateCompanyProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, industry, location, website, employeeCount, description, logo } = req.body;

    // Get current user to check for existing company
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    let company;

    if (user.companyId) {
        // Update existing company
        company = await prisma.company.update({
            where: { id: user.companyId },
            data: {
                name,
                industry,
                location,
                website,
                employeeCount: employeeCount ? parseInt(employeeCount) : undefined,
                description,
                logo,
            },
        });
    } else {
        // Create new company and link to user
        company = await prisma.company.create({
            data: {
                name,
                industry,
                location,
                website,
                employeeCount: employeeCount ? parseInt(employeeCount) : 0,
                description,
                logo,
                users: {
                    connect: { id: userId },
                },
            },
        });
    }

    res.json({
        success: true,
        message: 'Company profile updated',
        data: company,
    });
});

/**
 * GET /api/recruiter/company/:id - Public company profile
 */
const getCompanyProfile = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
        where: { id },
        include: {
            // Get active jobs for this company
            jobs: {
                where: { status: 'active', isDeleted: false },
                select: {
                    id: true,
                    title: true,
                    location: true,
                    salaryMin: true,
                    salaryMax: true,
                    jobType: true,
                    postedDate: true,
                    companyName: true,
                    companyLogo: true,
                },
                orderBy: { postedDate: 'desc' },
            },
        },
    });

    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    res.json({
        success: true,
        data: company,
    });
});

/**
 * POST /api/recruiter/company/logo — Upload company logo
 */
const uploadCompanyLogo = asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No logo file uploaded');

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    const userId = req.user.id;

    // Get user's company
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    if (!user.companyId) {
        throw ApiError.badRequest('No company profile found. Please create one first.');
    }

    const company = await prisma.company.update({
        where: { id: user.companyId },
        data: { logo: logoUrl },
    });

    res.json({
        success: true,
        message: 'Company logo uploaded',
        data: company,
    });
});

/**
 * GET /api/recruiter/team — Get all team members (users in the same company)
 */
const getTeamMembers = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Get current user's companyId
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    if (!user.companyId) {
        throw ApiError.badRequest('No company found for this recruiter. Please create a company profile.');
    }

    // Fetch all users in the same company
    const team = await prisma.user.findMany({
        where: { companyId: user.companyId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profileImage: true,
            createdAt: true,
            headline: true,
            location: true,
        },
        orderBy: { name: 'asc' },
    });

    res.json({
        success: true,
        data: team,
    });
});

/**
 * POST /api/recruiter/team/invite — Invite a team member
 */
const inviteTeamMember = asyncHandler(async (req, res) => {
    const { email, role } = req.body;

    if (!email || !email.includes('@')) {
        throw ApiError.badRequest('Valid email is required');
    }

    const userId = req.user.id;

    // Get user's company
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true, name: true },
    });

    if (!user.companyId) {
        throw ApiError.badRequest('No company found. Please create a company profile first.');
    }

    // Check if invite already exists
    const existing = await prisma.teamInvite.findUnique({
        where: {
            companyId_email: {
                companyId: user.companyId,
                email: email.trim().toLowerCase(),
            },
        },
    });

    if (existing) {
        return res.json({
            success: true,
            message: 'An invitation has already been sent to this email.',
            data: existing,
        });
    }

    const invite = await prisma.teamInvite.create({
        data: {
            companyId: user.companyId,
            invitedBy: userId,
            email: email.trim().toLowerCase(),
            role: role || 'Member',
        },
    });

    res.status(201).json({
        success: true,
        message: `Invitation sent to ${email}`,
        data: invite,
    });
});

/**
 * GET /api/recruiter/team/invites — List pending team invitations
 */
const getTeamInvites = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    if (!user.companyId) {
        throw ApiError.badRequest('No company found.');
    }

    const invites = await prisma.teamInvite.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: 'desc' },
        include: {
            inviter: {
                select: { name: true },
            },
        },
    });

    res.json({
        success: true,
        data: invites,
    });
});

/**
 * POST /api/recruiter/team/invite/accept — Accept a team invitation
 */
const acceptTeamInvite = asyncHandler(async (req, res) => {
    const { inviteId } = req.body;
    const userId = req.user.id;

    if (!inviteId) {
        throw ApiError.badRequest('Invite ID is required');
    }

    const invite = await prisma.teamInvite.findUnique({
        where: { id: inviteId },
    });

    if (!invite || invite.status !== 'pending') {
        throw ApiError.notFound('Invitation not found or already processed');
    }

    // Check the logged-in user's email matches the invite
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.email !== invite.email) {
        throw ApiError.forbidden('This invitation is not for your email');
    }

    // Update user's companyId and mark invite as accepted
    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { companyId: invite.companyId },
        }),
        prisma.teamInvite.update({
            where: { id: inviteId },
            data: { status: 'accepted' },
        }),
    ]);

    res.json({
        success: true,
        message: 'Invitation accepted. You are now part of the team.',
    });
});

/**
 * DELETE /api/recruiter/team/:memberId — Remove a team member
 */
const removeTeamMember = asyncHandler(async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.id;

    const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    if (!currentUser.companyId) {
        throw ApiError.badRequest('No company found.');
    }

    const member = await prisma.user.findUnique({
        where: { id: memberId },
        select: { companyId: true },
    });

    if (!member || member.companyId !== currentUser.companyId) {
        throw ApiError.notFound('Member not found in your team');
    }

    if (memberId === userId) {
        throw ApiError.badRequest('You cannot remove yourself from the team');
    }

    await prisma.user.update({
        where: { id: memberId },
        data: { companyId: null },
    });

    res.json({
        success: true,
        message: 'Team member removed',
    });
});

module.exports = { getDashboard, getAnalytics, getOwnCompanyProfile, searchCandidates, updateCompanyProfile, getCompanyProfile, uploadCompanyLogo, getTeamMembers, inviteTeamMember, getTeamInvites, acceptTeamInvite, removeTeamMember };