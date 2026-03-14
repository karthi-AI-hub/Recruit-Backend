const { prisma } = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isCompanyProfileComplete } = require('../utils/companyProfile');
const { hasActiveSubscription, canAccessAnalytics, canViewDirectContact } = require('../utils/subscriptionAccess');
const { expandSkillQueryToCanonicalSkills, normalizeSkillList } = require('../utils/skillNormalization');
const { sendTeamInviteEmail } = require('../utils/emailService');
const { TEAM_ROLES, requireRecruiterTeamRole, getRecruiterTeamRole } = require('../utils/recruiterTeamRole');

const TEAM_INVITE_TOKEN_EXPIRY = '7d';

const buildTeamInviteToken = ({ inviteId, companyId, email }) => jwt.sign(
    {
        type: 'team_invite',
        inviteId,
        companyId,
        email,
    },
    config.jwt.secret,
    { expiresIn: TEAM_INVITE_TOKEN_EXPIRY },
);

const decodeTeamInviteToken = (token) => {
    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        if (decoded?.type !== 'team_invite') return null;
        return decoded;
    } catch {
        return null;
    }
};

const acceptInviteForUser = async ({ invite, userId }) => {
    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { companyId: invite.companyId },
        }),
        prisma.teamInvite.update({
            where: { id: invite.id },
            data: { status: 'accepted' },
        }),
    ]);
};

const buildInviteAcceptUrl = (token) => {
    const encodedToken = encodeURIComponent(token);
    const base = (config.invite.acceptBaseUrl || '').trim();

    // Android custom scheme deep link, e.g. recruit://team-invite
    if (base.startsWith('recruit://')) {
        const deepLinkBase = base.replace(/\/$/, '');
        return `${deepLinkBase}?token=${encodedToken}`;
    }

    // Web URL fallback, e.g. https://app.example.com
    const webBase = base.replace(/\/$/, '');
    return `${webBase}/team-invite?token=${encodedToken}`;
};

/**
 * GET /api/recruiter/dashboard — Dashboard metrics
 */
const getDashboard = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const recruiter = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    if (!recruiter?.companyId) {
        throw ApiError.forbidden('You must create or join a company profile before accessing dashboard');
    }

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
        prisma.job.count({ where: { companyId: recruiter.companyId } }),

        // Active jobs
        prisma.job.count({ where: { companyId: recruiter.companyId, status: 'active' } }),

        // Total applications across all jobs
        prisma.application.count({
            where: { job: { companyId: recruiter.companyId } },
        }),

        // Applications grouped by status
        prisma.application.groupBy({
            by: ['status'],
            where: { job: { companyId: recruiter.companyId } },
            _count: true,
        }),

        // Recent applications (last 10)
        prisma.application.findMany({
            where: { job: { companyId: recruiter.companyId } },
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
            where: { companyId: recruiter.companyId },
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
        WHERE j.company_id = ${recruiter.companyId}
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
            WHERE j.company_id = ${recruiter.companyId}
        AND a.applied_date >= ${startDate}
      GROUP BY DATE(applied_date)
      ORDER BY date ASC
    `,
        // Conversion funnel
        prisma.application.groupBy({
            by: ['status'],
            where: {
                job: { companyId: recruiter.companyId },
                appliedDate: { gte: startDate }
            },
            _count: true,
        }),
        // Most requested skills
        prisma.$queryRaw`
      SELECT unnest(skills) as skill, COUNT(*)::int as count
      FROM jobs
    WHERE company_id = ${recruiter.companyId}
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

    await requireRecruiterTeamRole(
        userId,
        [TEAM_ROLES.ADMIN],
        'You don\'t have permission to update company profile.',
    );

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

    await requireRecruiterTeamRole(
        userId,
        [TEAM_ROLES.ADMIN],
        'You don\'t have permission to update company logo.',
    );

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

    const acceptedInvites = await prisma.teamInvite.findMany({
        where: {
            companyId: user.companyId,
            status: 'accepted',
        },
        select: { email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });

    const roleByEmail = new Map();
    for (const invite of acceptedInvites) {
        const emailKey = invite.email?.trim().toLowerCase();
        if (!emailKey || roleByEmail.has(emailKey)) continue;
        roleByEmail.set(emailKey, invite.role?.trim().toLowerCase() || TEAM_ROLES.VIEWER);
    }

    const teamWithRoles = team.map((member) => {
        const roleFromInvite = roleByEmail.get((member.email || '').trim().toLowerCase());
        const teamRole = roleFromInvite || TEAM_ROLES.ADMIN;

        return {
            ...member,
            teamRole,
        };
    });

    res.json({
        success: true,
        data: teamWithRoles,
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

    const allowedRoles = ['viewer', 'manager', 'admin'];
    const defaultRole = 'viewer';
    let normalizedRole = defaultRole;

    if (typeof role === 'string' && role.trim().length > 0) {
        normalizedRole = role.trim().toLowerCase();
    }

    if (!allowedRoles.includes(normalizedRole)) {
        throw ApiError.badRequest(`Invalid team role. Allowed roles: ${allowedRoles.join(', ')}`);
    }

    const userId = req.user.id;

    await requireRecruiterTeamRole(
        userId,
        [TEAM_ROLES.ADMIN],
        'You don\'t have permission to send team invitations.',
    );

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
    });

    if (existingUser) {
        throw ApiError.conflict('This email already has an account. Team invite is only for new users.');
    }

    // Get user's company
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true, name: true, company: { select: { name: true } } },
    });

    if (!user.companyId) {
        throw ApiError.badRequest('No company found. Please create a company profile first.');
    }

    // Check if invite already exists
    const existing = await prisma.teamInvite.findUnique({
        where: {
            companyId_email: {
                companyId: user.companyId,
                email: normalizedEmail,
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
            email: normalizedEmail,
            role: normalizedRole,
        },
    });

    const inviteToken = buildTeamInviteToken({
        inviteId: invite.id,
        companyId: invite.companyId,
        email: invite.email,
    });
    const acceptUrl = buildInviteAcceptUrl(inviteToken);

    sendTeamInviteEmail({
        to: invite.email,
        inviterName: user.name,
        companyName: user.company?.name,
        role: normalizedRole,
        acceptUrl,
    }).catch(() => {
        // Non-blocking: invite is still created even if email fails
    });

    res.status(201).json({
        success: true,
        message: `Invitation sent to ${email}`,
        data: {
            ...invite,
            acceptUrl,
        },
    });
});

/**
 * GET /api/recruiter/team/invites — List pending team invitations
 */
const getTeamInvites = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    await requireRecruiterTeamRole(
        userId,
        [TEAM_ROLES.ADMIN],
        'You don\'t have permission to view team invites.',
    );

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
 * POST /api/recruiter/team/invite/preview-link — Preview invitation details via secure token
 */
const previewTeamInviteByToken = asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
        throw ApiError.badRequest('Invite token is required');
    }

    const decoded = decodeTeamInviteToken(token.trim());
    if (!decoded) {
        throw ApiError.badRequest('Invalid or expired invite link');
    }

    const invite = await prisma.teamInvite.findUnique({
        where: { id: decoded.inviteId },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    logo: true,
                    industry: true,
                    location: true,
                },
            },
            inviter: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
    });

    if (!invite || invite.status !== 'pending') {
        throw ApiError.notFound('Invitation not found or already processed');
    }

    if (invite.companyId !== decoded.companyId || invite.email !== decoded.email) {
        throw ApiError.badRequest('Invite link is invalid');
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: invite.email },
        select: { id: true },
    });

    res.json({
        success: true,
        data: {
            email: invite.email,
            role: invite.role,
            invitedAt: invite.createdAt,
            inviter: invite.inviter,
            company: invite.company,
            hasExistingAccount: !!existingUser,
        },
    });
});

/**
 * POST /api/recruiter/team/invite/accept-link — Accept a team invitation via secure token
 */
const acceptTeamInviteByToken = asyncHandler(async (req, res) => {
    const { token, password, name } = req.body;

    if (!token || typeof token !== 'string') {
        throw ApiError.badRequest('Invite token is required');
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
        throw ApiError.badRequest('A password with minimum 6 characters is required');
    }

    const decoded = decodeTeamInviteToken(token.trim());
    if (!decoded) {
        throw ApiError.badRequest('Invalid or expired invite link');
    }

    const invite = await prisma.teamInvite.findUnique({
        where: { id: decoded.inviteId },
    });

    if (!invite || invite.status !== 'pending') {
        throw ApiError.notFound('Invitation not found or already processed');
    }

    if (invite.companyId !== decoded.companyId || invite.email !== decoded.email) {
        throw ApiError.badRequest('Invite link is invalid');
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: invite.email },
        select: { id: true },
    });

    if (existingUser) {
        throw ApiError.conflict('This email already has an account. Please login and contact your admin.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const derivedName = typeof name === 'string' && name.trim().length >= 2
        ? name.trim()
        : invite.email.split('@')[0];

    const createdUser = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
            data: {
                name: derivedName,
                email: invite.email,
                passwordHash,
                role: 'recruiter',
                companyId: invite.companyId,
                emailVerified: true,
            },
            select: { id: true, email: true },
        });

        await tx.teamInvite.update({
            where: { id: invite.id },
            data: { status: 'accepted' },
        });

        return newUser;
    });

    res.json({
        success: true,
        message: 'Invitation accepted. Your recruiter account has been created. Please login with your invited email and password.',
        data: {
            email: createdUser.email,
            companyId: invite.companyId,
            role: invite.role,
        },
    });
});

/**
 * DELETE /api/recruiter/team/:memberId — Remove a team member
 */
const removeTeamMember = asyncHandler(async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.id;

    await requireRecruiterTeamRole(
        userId,
        [TEAM_ROLES.ADMIN],
        'You don\'t have permission to remove team members.',
    );

    const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });

    if (!currentUser.companyId) {
        throw ApiError.badRequest('No company found.');
    }

    const member = await prisma.user.findUnique({
        where: { id: memberId },
        select: { companyId: true, email: true },
    });

    if (!member || member.companyId !== currentUser.companyId) {
        throw ApiError.notFound('Member not found in your team');
    }

    if (memberId === userId) {
        throw ApiError.badRequest('You cannot remove yourself from the team');
    }

    const targetTeamRole = await getRecruiterTeamRole(memberId);
    if (targetTeamRole === TEAM_ROLES.ADMIN) {
        const companyUsers = await prisma.user.findMany({
            where: { companyId: currentUser.companyId },
            select: { id: true },
        });

        const companyRoles = await Promise.all(
            companyUsers.map((companyUser) => getRecruiterTeamRole(companyUser.id)),
        );
        const adminCount = companyRoles.filter((role) => role === TEAM_ROLES.ADMIN).length;

        if (adminCount <= 1) {
            throw ApiError.badRequest('Cannot remove the last admin from the team');
        }
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: memberId },
            data: { companyId: null },
        }),
        prisma.teamInvite.updateMany({
            where: {
                companyId: currentUser.companyId,
                email: member.email,
                status: 'accepted',
            },
            data: { status: 'removed' },
        }),
    ]);

    res.json({
        success: true,
        message: 'Team member removed',
    });
});

module.exports = { getDashboard, getAnalytics, getOwnCompanyProfile, searchCandidates, updateCompanyProfile, getCompanyProfile, uploadCompanyLogo, getTeamMembers, inviteTeamMember, getTeamInvites, previewTeamInviteByToken, acceptTeamInviteByToken, removeTeamMember };