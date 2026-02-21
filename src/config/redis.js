const Redis = require('ioredis');
const config = require('./env');

let redis = null;

try {
    redis = new Redis(config.redis.url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 3) {
                console.warn('  ⚠️  Redis: max retries reached, running without cache');
                return null;
            }
            return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
    });

    redis.on('error', (err) => {
        console.warn('  ⚠️  Redis error (non-fatal):', err.message);
    });
} catch (err) {
    console.warn('  ⚠️  Redis init failed (non-fatal):', err.message);
}

async function connectRedis() {
    if (!redis) {
        console.log('  ⚠️  Redis skipped (not configured)');
        return false;
    }
    try {
        await redis.connect();
        console.log('  ✅ Redis connected');
        return true;
    } catch (err) {
        console.warn('  ⚠️  Redis unavailable (non-fatal):', err.message);
        return false;
    }
}

module.exports = { redis, connectRedis };