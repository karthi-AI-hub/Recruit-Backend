const Redis = require('ioredis');
const config = require('./env');
const logger = require('./logger');

let redis = null;

try {
    redis = new Redis(config.redis.url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 3) {
                logger.warn('  ⚠️  Redis: max retries reached, running without cache');
                return null;
            }
            return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
    });

    redis.on('error', (err) => {
        logger.warn('  ⚠️  Redis error (non-fatal):', err.message);
    });
} catch (err) {
    logger.warn('  ⚠️  Redis init failed (non-fatal):', err.message);
}

async function connectRedis() {
    if (!redis) {
        logger.info('  ⚠️  Redis skipped (not configured)');
        return false;
    }
    try {
        await redis.connect();
        logger.info('  ✅ Redis connected');
        return true;
    } catch (err) {
        logger.warn('  ⚠️  Redis unavailable (non-fatal):', err.message);
        return false;
    }
}

module.exports = { redis, connectRedis };