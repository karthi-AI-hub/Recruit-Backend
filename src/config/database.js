const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Test database connection
async function connectDB() {
    try {
        await prisma.$connect();
        console.log('  ✅ PostgreSQL connected');
        return true;
    } catch (err) {
        console.error('  ❌ PostgreSQL connection failed:', err.message);
        return false;
    }
}

module.exports = { prisma, connectDB };
