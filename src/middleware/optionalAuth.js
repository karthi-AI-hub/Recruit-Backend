const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Optional auth middleware — allows guest browsing.
 * If a valid JWT is present, attaches user to req. Otherwise, continues without error.
 * Guest endpoints (e.g. GET /api/jobs) use this.
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded; // { id, email, role }
    } catch {
        req.user = null; // Invalid/expired token → treat as guest
    }

    next();
};

module.exports = optionalAuth;
