const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Server } = require('socket.io');


// Load env first
const config = require('./config/env');
const logger = require('./config/logger');

// Import routes
const authRoutes = require('./routes/auth.routes');
const jobRoutes = require('./routes/jobs.routes');
const applicationRoutes = require('./routes/applications.routes');
const profileRoutes = require('./routes/profile.routes');
const messageRoutes = require('./routes/messages.routes');
const notificationRoutes = require('./routes/notifications.routes');
const templateRoutes = require('./routes/templates.routes');
const savedJobRoutes = require('./routes/savedJobs.routes');
const recruiterRoutes = require('./routes/recruiter.routes');
const skillRoutes = require('./routes/skills.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const subscriptionRoutes = require('./routes/subscription.routes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const sanitize = require('./middleware/sanitize');

// Import Socket.io handler
const initChatSocket = require('./socket/chat.socket');
const { setIO } = require('./socket/io');
const { initFirebase } = require('./config/firebase');

// ─── APP SETUP ──────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── SOCKET.IO ──────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: "*",
        credentials: true,
    },
});

// Store io globally so controllers / utils can emit events
setIO(io);

// Initialize chat socket handlers
initChatSocket(io);

// ─── MIDDLEWARE ──────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Render, Railway, etc.)
app.use(require('compression')()); // Gzip compression
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: "*", credentials: true }));
const isProduction = config.nodeEnv === 'production';
app.use(isProduction ? morgan('combined', { stream: logger.stream }) : morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sanitize); // Strip HTML/script tags from user input

// Safety: ensure req.body is always at least an empty object
app.use((req, _res, next) => {
    if (req.body === undefined || req.body === null) {
        req.body = {};
    }
    next();
});

// Rate limiting
const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.globalMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many auth attempts, please try again later' },
});

app.use('/api/auth', authLimiter);
app.use('/api/', globalLimiter);

// Serve uploads as static files
app.use('/uploads', express.static(path.resolve(config.upload.dir)));

// ─── ROUTES ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/saved-jobs', savedJobRoutes);
app.use('/api/recruiter', recruiterRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/chat', require('./routes/chat.routes')); // Added Chat Routes

// Health check — includes DB & Redis connectivity
app.get('/', async (req, res) => {
    let dbOk = false;
    let redisOk = false;
    try {
        await prisma.$queryRawUnsafe('SELECT 1');
        dbOk = true;
    } catch (_) {}
    try {
        if (redis && redis.status === 'ready') {
            await redis.ping();
            redisOk = true;
        }
    } catch (_) {}
    const ok = dbOk; // Redis is optional
    res.status(ok ? 200 : 503).json({
        success: ok,
        message: ok ? 'Recurite API is running' : 'Service degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: { database: dbOk, redis: redisOk },
        uptime: Math.floor(process.uptime()),
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Global error handler (must be last)
app.use(errorHandler);

// ─── START SERVER ───────────────────────────────────────
const PORT = config.port;
const { connectDB } = require('./config/database');
const { connectRedis, redis } = require('./config/redis');
const { prisma } = require('./config/database');

async function startServer() {
    logger.info('');
    logger.info('╔══════════════════════════════════════════════╗');
    logger.info('║        🚀 RECURITE API SERVER                ║');
    logger.info('╚══════════════════════════════════════════════╝');
    logger.info('');
    logger.info('  Connecting services...');

    // Connect to PostgreSQL
    await connectDB();

    // Connect to Redis (optional — app works without it)
    await connectRedis();

    // Initialise Firebase Admin (optional — push works only when configured)
    initFirebase();

    logger.info('  ─────────────────────────────────────────────');
    logger.info(`  📝 Environment : ${config.nodeEnv}`);
    logger.info(`  🔗 Server      : http://localhost:${PORT}`);
    logger.info(`  💡 Health      : http://localhost:${PORT}/`);
    logger.info(`  🗄️  DB Studio   : npm run db:studio (port 5555)`);
    logger.info('  ─────────────────────────────────────────────');

    server.listen(PORT, () => {
        logger.info(`  ✅ Server listening on port ${PORT}`);
    });
}

startServer().catch((err) => {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down...');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    logger.info('SIGINT received. Shutting down...');
    server.close(() => process.exit(0));
});

module.exports = { app, server, io };

