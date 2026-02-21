const { redis } = require('../config/redis');

/**
 * cacheMiddleware(keyPrefix, ttlSeconds)
 * 
 * - Only caches GET requests (unless specific logic is added).
 * - Generates key: `${keyPrefix}:${req.user.id}` or similar depending on needs.
 * - But to be flexible, we can accept a key generator function.
 */

// Simple duration constants
const CACHE_TTL = {
    PROFILE: 120,    // 2 minutes
    JOBS: 60,        // 1 minute
    APPS: 60,        // 1 minute
    NOTIFS: 30,      // 30 seconds
    SAVED: 60,       // 1 minute
};

/**
 * Middleware to cache GET responses
 * @param {Function} keyGenerator (req) => string
 * @param {number} ttl seconds
 */
const cacheMiddleware = (keyGenerator, ttl = 60) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        if (!redis) {
            return next();
        }

        const cacheKey = keyGenerator(req);
        if (!cacheKey) {
            return next();
        }

        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                // Return cached response
                return res.json(JSON.parse(cachedData));
            }

            // Hijack res.json to cache the response
            const originalJson = res.json;
            res.json = function (body) {
                // Restore original
                res.json = originalJson;

                // Fire and forget cache set
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    redis.setex(cacheKey, ttl, JSON.stringify(body)).catch(err => {
                        console.warn('Redis cache set error:', err.message);
                    });
                }

                // Return original response
                return originalJson.call(this, body);
            };

            next();
        } catch (err) {
            console.warn('Redis cache middleware error:', err.message);
            next();
        }
    };
};

/**
 * Utility to invalidate cache keys by pattern
 * @param {string} pattern e.g. "profile:123*"
 */
const invalidateCache = async (pattern) => {
    if (!redis) return;
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch (err) {
        console.warn('Redis invalidate error:', err.message);
    }
};

module.exports = {
    cacheMiddleware,
    invalidateCache,
    CACHE_TTL
};
