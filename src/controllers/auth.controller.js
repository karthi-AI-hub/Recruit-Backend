const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendPasswordResetEmail } = require('../utils/emailService');
const logger = require('../config/logger');

/**
 * Generate access + refresh tokens for a user.
 */
const generateTokens = (user) => {
    const payload = { id: user.id, email: user.email, role: user.role };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn,
    });

    return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password || !role) {
        throw ApiError.badRequest('Missing required fields: name, email, password, role');
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        throw ApiError.conflict('Email is already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate email verification token (6-digit OTP)
    const verifyOtp = crypto.randomInt(100000, 999999).toString();

    // Create user
    const user = await prisma.user.create({
        data: {
            name,
            email,
            passwordHash,
            phone,
            role,
            emailVerifyToken: verifyOtp,
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            createdAt: true,
        },
    });
    sendPasswordResetEmail(email, verifyOtp).catch((err) => {
        logger.error(`Failed to send verification email to ${email}: ${err.message}`);
    });

    // Generate tokens
    const tokens = generateTokens(user);

    // Save refresh token
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
    });

    res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your email.',
        data: {
            user,
            ...tokens,
        },
    });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw ApiError.badRequest('Email and password are required');
    }

    // Find user
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    logo: true,
                    industry: true,
                    location: true,
                    description: true,
                    website: true,
                    employeeCount: true,
                    subscriptionPlan: true,
                    subscriptionStatus: true,
                    trialEndsAt: true,
                },
            },
        },
    });

    if (!user) {
        throw ApiError.unauthorized('Invalid email or password');
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        throw ApiError.unauthorized('Invalid email or password');
    }

    // Generate tokens
    const tokens = generateTokens(user);

    // Save refresh token
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
    });

    // Build response (exclude sensitive fields)
    const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        headline: user.headline,
        location: user.location,
        experience: user.experience,
        skills: user.skills,
        company: user.company,
        createdAt: user.createdAt,
    };

    res.json({
        success: true,
        message: 'Login successful',
        data: {
            user: userResponse,
            ...tokens,
        },
    });
});

/**
 * POST /api/auth/refresh-token
 */
const refreshTokenHandler = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw ApiError.badRequest('Refresh token is required');
    }

    // Verify refresh token
    let decoded;
    try {
        decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
        throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    // Check if user exists and refresh token matches
    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
    });

    if (!user || user.refreshToken !== refreshToken) {
        throw ApiError.unauthorized('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    // Save new refresh token
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
    });

    res.json({
        success: true,
        data: tokens,
    });
});

/**
 * GET /api/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            profileImage: true,
            headline: true,
            location: true,
            experience: true,
            skills: true,
            resumeUrl: true,
            currentCompany: true,
            currentDesignation: true,
            expectedSalary: true,
            isAvailable: true,
            noticePeriod: true,
            currentCtc: true,
            isProfileHidden: true,
            company: {
                select: {
                    id: true,
                    name: true,
                    logo: true,
                    industry: true,
                    location: true,
                    description: true,
                    website: true,
                    employeeCount: true,
                    subscriptionPlan: true,
                    subscriptionStatus: true,
                    trialEndsAt: true,
                },
            },
            createdAt: true,
        },
    });

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    res.json({
        success: true,
        data: user,
    });
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
    await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null },
    });

    res.json({
        success: true,
        message: 'Logged out successfully',
    });
});

/**
 * POST /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw ApiError.badRequest('Current and new passwords are required');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
        throw ApiError.unauthorized('Incorrect current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
        where: { id: req.user.id },
        data: { passwordHash },
    });

    res.json({
        success: true,
        message: 'Password changed successfully',
    });
});

/**
 * DELETE /api/auth/delete-account
 */
const deleteAccount = asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password) {
        throw ApiError.badRequest('Password is required to delete account');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        throw ApiError.unauthorized('Incorrect password');
    }

    // Delete user (cascade will handle relations)
    await prisma.user.delete({ where: { id: req.user.id } });

    res.json({
        success: true,
        message: 'Account deleted successfully',
    });
});

/**
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw ApiError.badRequest('Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
        res.json({
            success: true,
            message: 'If an account exists with this email, a reset code has been sent.',
        });
        return;
    }

    // Invalidate any previous unused tokens for this email
    await prisma.passwordReset.updateMany({
        where: { email, used: false },
        data: { used: true },
    });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const tokenHash = await bcrypt.hash(otp, 10);

    // Store with 10-minute expiry
    await prisma.passwordReset.create({
        data: {
            email,
            tokenHash,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
    });

    // Send email (logs OTP in dev when SMTP is not configured)
    await sendPasswordResetEmail(email, otp);

    res.json({
        success: true,
        message: 'If an account exists with this email, a reset code has been sent.',
    });
});

/**
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        throw ApiError.badRequest('Email, OTP and new password are required');
    }

    if (newPassword.length < 6) {
        throw ApiError.badRequest('Password must be at least 6 characters');
    }

    // Find the most recent unused, non-expired token for this email
    const resetRecord = await prisma.passwordReset.findFirst({
        where: {
            email,
            used: false,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord) {
        throw ApiError.badRequest('Invalid or expired reset code');
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, resetRecord.tokenHash);
    if (!isValid) {
        throw ApiError.badRequest('Invalid or expired reset code');
    }

    // Mark token as used
    await prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
    });

    // Update the user's password
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        throw ApiError.badRequest('Invalid or expired reset code');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, refreshToken: null },
    });

    logger.info(`Password reset completed for ${email}`);

    res.json({
        success: true,
        message: 'Password has been reset successfully. Please sign in with your new password.',
    });
});

/**
 * POST /api/auth/verify-email
 */
const verifyEmail = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        throw ApiError.badRequest('Email and OTP are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        throw ApiError.badRequest('Invalid verification code');
    }

    if (user.emailVerified) {
        return res.json({ success: true, message: 'Email already verified' });
    }

    if (user.emailVerifyToken !== otp) {
        throw ApiError.badRequest('Invalid verification code');
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifyToken: null },
    });

    logger.info(`Email verified for ${email}`);

    res.json({
        success: true,
        message: 'Email verified successfully',
    });
});

/**
 * POST /api/auth/resend-verification
 */
const resendVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw ApiError.badRequest('Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) {
        // Return success to prevent email enumeration
        return res.json({ success: true, message: 'If the email exists and is unverified, a new code has been sent.' });
    }

    const verifyOtp = crypto.randomInt(100000, 999999).toString();
    await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken: verifyOtp },
    });

    await sendPasswordResetEmail(email, verifyOtp);

    res.json({
        success: true,
        message: 'If the email exists and is unverified, a new code has been sent.',
    });
});

module.exports = { register, login, refreshToken: refreshTokenHandler, getMe, logout, changePassword, deleteAccount, forgotPassword, resetPassword, verifyEmail, resendVerification };
