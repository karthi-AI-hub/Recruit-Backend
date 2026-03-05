const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

async function connectDB() {
    try {
        await prisma.$connect();
        logger.info('  ✅ PostgreSQL connected');
        return true;
    } catch (err) {
        logger.error('  ❌ PostgreSQL connection failed:', err.message);
        return false;
    }
}

module.exports = { prisma, connectDB };
