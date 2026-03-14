const { prisma } = require('../config/database');
const ApiError = require('./ApiError');

const TEAM_ROLES = {
    VIEWER: 'viewer',
    MANAGER: 'manager',
    ADMIN: 'admin',
};

const getRecruiterTeamRole = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            role: true,
            companyId: true,
        },
    });

    if (!user || user.role !== 'recruiter' || !user.companyId) {
        return null;
    }

    const acceptedInvite = await prisma.teamInvite.findFirst({
        where: {
            companyId: user.companyId,
            email: user.email,
            status: 'accepted',
        },
        orderBy: { createdAt: 'desc' },
        select: { role: true },
    });

    if (!acceptedInvite?.role) {
        return TEAM_ROLES.ADMIN;
    }

    const normalizedRole = acceptedInvite.role.trim().toLowerCase();
    if (Object.values(TEAM_ROLES).includes(normalizedRole)) {
        return normalizedRole;
    }

    return TEAM_ROLES.VIEWER;
};

const requireRecruiterTeamRole = async (userId, allowedRoles, forbiddenMessage) => {
    const teamRole = await getRecruiterTeamRole(userId);

    if (!teamRole) {
        throw ApiError.forbidden('Recruiter account is not linked to a company');
    }

    if (!allowedRoles.includes(teamRole)) {
        throw ApiError.forbidden(forbiddenMessage);
    }

    return teamRole;
};

module.exports = {
    TEAM_ROLES,
    getRecruiterTeamRole,
    requireRecruiterTeamRole,
};
