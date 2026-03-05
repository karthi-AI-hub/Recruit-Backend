/**
 * Input sanitization middleware.
 * Strips HTML tags and script injections from all string values
 * in req.body, req.query, and req.params.
 */

function stripTags(value) {
    if (typeof value === 'string') {
        return value
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]*>/g, '')
            .trim();
    }
    if (Array.isArray(value)) {
        return value.map(stripTags);
    }
    if (value && typeof value === 'object') {
        return sanitizeObject(value);
    }
    return value;
}

function sanitizeObject(obj) {
    const cleaned = {};
    for (const [key, val] of Object.entries(obj)) {
        cleaned[key] = stripTags(val);
    }
    return cleaned;
}

function sanitize(req, _res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }
    if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params);
    }
    next();
}

module.exports = sanitize;
