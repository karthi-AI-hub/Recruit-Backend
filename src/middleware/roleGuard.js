const ApiError = require('../utils/ApiError');

/**
 * Role guard middleware factory.
 * Usage: roleGuard('recruiter') or roleGuard('job_seeker', 'recruiter')
 *
 * Must be used AFTER auth middleware (req.user must exist).
 */
const roleGuard = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw ApiError.unauthorized('Authentication required');
        }

        if (!allowedRoles.includes(req.user.role)) {
            throw ApiError.forbidden(
                `Access denied. Required role: ${allowedRoles.join(' or ')}`
            );
        }

        next();
    };
};

module.exports = roleGuard;
