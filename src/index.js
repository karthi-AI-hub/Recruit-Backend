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

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import Socket.io handler
const initChatSocket = require('./socket/chat.socket');

// ─── APP SETUP ──────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── SOCKET.IO ──────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: '*', // Allow Flutter app connections
        methods: ['GET', 'POST'],
    },
});

// Initialize chat socket handlers
initChatSocket(io);

// ─── MIDDLEWARE ──────────────────────────────────────────
app.use(require('compression')()); // Gzip compression
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Safety: ensure req.body is always at least an empty object
app.use((req, _res, next) => {
    if (req.body === undefined || req.body === null) {
        req.body = {};
    }
    next();
});

// Rate limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 login/register attempts
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
app.use('/api/chat', require('./routes/chat.routes')); // Added Chat Routes

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Recurite API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
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
const { connectRedis } = require('./config/redis');

async function startServer() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║        🚀 RECURITE API SERVER                ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  Connecting services...');
    console.log('');

    // Connect to PostgreSQL
    await connectDB();

    // Connect to Redis (optional — app works without it)
    await connectRedis();

    console.log('');
    console.log('  ─────────────────────────────────────────────');
    console.log(`  📝 Environment : ${config.nodeEnv}`);
    console.log(`  🔗 Server      : http://localhost:${PORT}`);
    console.log(`  💡 Health      : http://localhost:${PORT}/`);
    console.log(`  🗄️  DB Studio   : npm run db:studio (port 5555)`);
    console.log('  ─────────────────────────────────────────────');
    console.log('');

    server.listen(PORT, () => {
        console.log(`  ✅ Server listening on port ${PORT}`);
        console.log('');
    });
}

startServer().catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close(() => process.exit(0));
});

module.exports = { app, server, io };

