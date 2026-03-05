const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { invalidateCache } = require('../middleware/cache.middleware');
const { canViewDirectContact } = require('../utils/subscriptionAccess');
const { normalizeSkillList } = require('../utils/skillNormalization');

/**
 * GET /api/profile — Get current user profile
 */
const getProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = `profile:${userId}`;

    // Try cache
    if (require('../config/redis').redis) {
        try {
            const cached = await require('../config/redis').redis.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));
        } catch { }
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
            summary: true,
            about: true,
            github: true,
            linkedIn: true,
            portfolio: true,
            isProfileHidden: true,
            company: true,
            createdAt: true,
            education: true,
            workExperience: true,
        },
    });

    if (!user) throw ApiError.notFound('User not found');

    const response = { success: true, data: user };

    // Set cache
    if (require('../config/redis').redis) {
        try {
            await require('../config/redis').redis.setex(cacheKey, 600, JSON.stringify(response)); // 10 mins cache
        } catch { }
    }

    res.json(response);
});

/**
 * PATCH /api/profile — Update profile
 */
const updateProfile = asyncHandler(async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        throw ApiError.badRequest('No fields to update');
    }

    const userId = req.user.id;
    const { education, workExperience, company, ...userData } = req.body;

    if (Object.prototype.hasOwnProperty.call(userData, 'skills')) {
        userData.skills = await normalizeSkillList(userData.skills, {
            createMissing: true,
            incrementUsage: true,
        });
    }

    // Build array of prisma promises for transaction
    const transactions = [];

    // 1. Update User Basic Info
    transactions.push(
        prisma.user.update({
            where: { id: userId },
            data: userData,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                profileImage: true,
                headline: true,
                location: true,
                experience: true,
                skills: true,
                resumeUrl: true,
                currentCompany: true,
                currentDesignation: true,
                expectedSalary: true,
                isAvailable: true,
                noticePeriod: true,
                currentCtc: true,
                summary: true,
                about: true,
                github: true,
                linkedIn: true,
                portfolio: true,
                isProfileHidden: true,
            },
        })
    );

    // 2. Update Education (if provided)
    if (education && Array.isArray(education)) {
        transactions.push(prisma.education.deleteMany({ where: { userId } }));
        if (education.length > 0) {
            transactions.push(
                prisma.education.createMany({
                    data: education.map(edu => ({
                        userId,
                        degree: edu.degree,
                        institution: edu.institution,
                        field: edu.field,
                        startYear: new Date(edu.startYear),
                        endYear: new Date(edu.endYear),
                        grade: edu.grade,
                        location: edu.location,
                    })),
                })
            );
        }
    }

    // 3. Update Work Experience (if provided)
    if (workExperience && Array.isArray(workExperience)) {
        transactions.push(prisma.workExperience.deleteMany({ where: { userId } }));
        if (workExperience.length > 0) {
            transactions.push(
                prisma.workExperience.createMany({
                    data: workExperience.map(exp => ({
                        userId,
                        company: exp.company,
                        designation: exp.designation,
                        location: exp.location,
                        startDate: new Date(exp.startDate),
                        endDate: exp.endDate ? new Date(exp.endDate) : null,
                        isCurrent: exp.isCurrent,
                        description: exp.description,
                    })),
                })
            );
        }
    }

    // 4. Update Company (if provided & user is recruiter)
    if (company && req.user.role === 'recruiter') {
        // First check if user has a company
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });

        if (user.companyId) {
            transactions.push(
                prisma.company.update({
                    where: { id: user.companyId },
                    data: {
                        name: company.name,
                        industry: company.industry,
                        location: company.location,
                        website: company.website,
                        employeeCount: company.employeeCount ? parseInt(company.employeeCount) : undefined,
                        description: company.description,
                        logo: company.logo,
                    }
                })
            );
        } else {
            // Create new company logic is usually separate, but we can support upsert if needed.
            // For now, let's assume update only if exists, or simple create.
            transactions.push(
                prisma.company.create({
                    data: {
                        ...company,
                        employeeCount: company.employeeCount ? parseInt(company.employeeCount) : 0,
                        users: { connect: { id: userId } }
                    }
                })
            );
        }
    }

    // Execute transaction
    await prisma.$transaction(transactions);

    // Fetch final consolidated profile to return
    const finalProfile = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
            summary: true,
            about: true,
            github: true,
            linkedIn: true,
            portfolio: true,
            isProfileHidden: true,
            education: true,
            workExperience: true,
            company: true,
        },
    });

    await invalidateCache(`profile:${userId}`);

    res.json({
        success: true,
        message: 'Profile updated successfully',
        data: finalProfile,
    });
});

/**
 * POST /api/profile/resume — Upload resume
 */
const uploadResume = asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No resume file uploaded');

    const resumeUrl = `/uploads/resumes/${req.file.filename}`;

    const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { resumeUrl },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
        },
    });

    await invalidateCache(`profile:${req.user.id}`);

    res.json({
        success: true,
        message: 'Resume uploaded',
        data: updated,
    });
});

/**
 * POST /api/profile/image — Upload profile image
 */
const uploadProfileImage = asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No image file uploaded');

    const profileImage = `/uploads/profiles/${req.file.filename}`;

    const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { profileImage },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
        },
    });

    await invalidateCache(`profile:${req.user.id}`);

    res.json({
        success: true,
        message: 'Profile image uploaded',
        data: updated,
    });
});

/**
 * GET /api/profile/:userId — Get a user's public profile
 *
 * Respects isProfileHidden (unless viewer is the user themselves).
 * Contact fields (email, phone) are masked unless the requesting
 * recruiter has a Premium/Custom plan.
 */
const getPublicProfile = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            currentCompany: true,
            currentDesignation: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
            summary: true,
            about: true,
            isProfileHidden: true,
            workExperience: true,
            education: true,
            certifications: true,
            resumeUrl: true,
            linkedIn: true,
            github: true,
            portfolio: true,
            expectedSalary: true,
            company: {
                select: { id: true, name: true, logo: true },
            },
            createdAt: true,
        },
    });

    if (!user) throw ApiError.notFound('User not found');

    // Respect profile hidden flag (owner can always see their own)
    const isOwner = req.user.id === user.id;
    if (user.isProfileHidden && !isOwner) {
        throw ApiError.notFound('This profile is not available');
    }

    // Determine contact access for recruiter viewers
    let allowDirectContact = isOwner; // owners always see their own info
    if (!isOwner && req.user.role === 'recruiter') {
        const recruiter = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                company: {
                    select: {
                        subscriptionPlan: true,
                        subscriptionStatus: true,
                        trialEndsAt: true,
                    },
                },
            },
        });
        allowDirectContact = recruiter?.company
            ? canViewDirectContact(recruiter.company)
            : false;
    }

    // Strip internal fields before responding
    const { isProfileHidden, ...profileData } = user;

    // Mask contact info if not allowed
    if (!allowDirectContact) {
        profileData.email = null;
        profileData.phone = null;
    }

    res.json({
        success: true,
        data: profileData,
        access: {
            canViewDirectContact: allowDirectContact,
        },
    });
});


/**
 * PUT /api/profile/education — Update education (Replace all)
 */
const updateEducation = asyncHandler(async (req, res) => {
    const { education } = req.body;

    if (!Array.isArray(education)) {
        throw ApiError.badRequest('Education must be an array');
    }

    const toYearDate = (value) => {
        if (value === null || value === undefined || value === '') return null;
        if (value instanceof Date) return value;
        if (typeof value === 'number') {
            if (value >= 1000 && value <= 9999) {
                return new Date(`${value}-01-01`);
            }
            return new Date(value);
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^\d{4}$/.test(trimmed)) {
                return new Date(`${trimmed}-01-01`);
            }
            const parsed = new Date(trimmed);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        return null;
    };

    // Transaction to replace education (delete all for user, then create new)
    await prisma.$transaction([
        prisma.education.deleteMany({ where: { userId: req.user.id } }),
        prisma.education.createMany({
            data: education.map(edu => ({
                userId: req.user.id,
                degree: edu.degree,
                institution: edu.institution,
                field: edu.field,
                startYear: toYearDate(edu.startYear),
                endYear: toYearDate(edu.endYear) || toYearDate(edu.startYear),
                grade: edu.grade,
                location: edu.location,
            })),
        }),
    ]);

    // Return full profile
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
            isProfileHidden: true,
            education: true,
            workExperience: true,
        },
    });

    await invalidateCache(`profile:${req.user.id}`);

    res.json({
        success: true,
        message: 'Education updated',
        data: user,
    });
});

/**
 * PUT /api/profile/experience — Update work experience (Replace all)
 */
const updateWorkExperience = asyncHandler(async (req, res) => {
    const { workExperience } = req.body;

    if (!Array.isArray(workExperience)) {
        throw ApiError.badRequest('Work experience must be an array');
    }

    await prisma.$transaction([
        prisma.workExperience.deleteMany({ where: { userId: req.user.id } }),
        prisma.workExperience.createMany({
            data: workExperience.map(exp => ({
                userId: req.user.id,
                company: exp.company,
                designation: exp.designation,
                location: exp.location,
                startDate: new Date(exp.startDate),
                endDate: exp.endDate ? new Date(exp.endDate) : null,
                isCurrent: exp.isCurrent,
                description: exp.description,
            })),
        }),
    ]);

    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
            isProfileHidden: true,
            education: true,
            workExperience: true,
        },
    });

    await invalidateCache(`profile:${req.user.id}`);

    res.json({
        success: true,
        message: 'Work experience updated',
        data: user,
    });
});

/**
 * GET /api/profile/preferences — Get user preferences + blocked companies
 */
const getPreferences = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { preferences: true, blockedCompanies: true },
    });

    if (!user) throw ApiError.notFound('User not found');

    res.json({
        success: true,
        data: {
            preferences: user.preferences || {},
            blockedCompanies: user.blockedCompanies || [],
        },
    });
});

/**
 * PATCH /api/profile/preferences — Update user preferences (email/notification settings)
 * Body: { emailPrefs: {...}, jobAlerts: bool, emailNotifications: bool, pushNotifications: bool }
 */
const updatePreferences = asyncHandler(async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        throw ApiError.badRequest('No preferences to update');
    }

    const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { preferences: req.body },
        select: { preferences: true },
    });

    await invalidateCache(`profile:${req.user.id}`);

    res.json({
        success: true,
        message: 'Preferences updated',
        data: updated.preferences,
    });
});

/**
 * PATCH /api/profile/blocked-companies — Update blocked companies list
 * Body: { blockedCompanies: ["Company A", "Company B"] }
 */
const updateBlockedCompanies = asyncHandler(async (req, res) => {
    const { blockedCompanies } = req.body;

    if (!Array.isArray(blockedCompanies)) {
        throw ApiError.badRequest('blockedCompanies must be an array');
    }

    const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { blockedCompanies },
        select: { blockedCompanies: true },
    });

    await invalidateCache(`profile:${req.user.id}`);

    res.json({
        success: true,
        message: 'Blocked companies updated',
        data: updated.blockedCompanies,
    });
});

module.exports = {
    getProfile,
    updateProfile,
    updateEducation,
    updateWorkExperience,
    uploadResume,
    uploadProfileImage,
    getPublicProfile,
    getPreferences,
    updatePreferences,
    updateBlockedCompanies,
};
