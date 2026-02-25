const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * Valid subscription plans
 */
const VALID_PLANS = ['Normal', 'Premium'];

/**
 * Plan duration in days based on billing cycle
 */
const PLAN_DURATION = {
    monthly: 30,
    yearly: 365,
    trial: 7,
};

/**
 * POST /api/subscription/subscribe
 * Subscribes a recruiter's company to a specific plan
 */
const subscribe = asyncHandler(async (req, res) => {
    const { planName, isYearly } = req.body;

    if (!planName || !VALID_PLANS.includes(planName)) {
        throw ApiError.badRequest('Invalid or missing planName. Must be "Normal" or "Premium"');
    }

    // Must be a recruiter with a company
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });

    if (user.role !== 'recruiter') {
        throw ApiError.forbidden('Only recruiters can subscribe');
    }

    if (!user.companyId) {
        throw ApiError.badRequest('You must create a company profile first before subscribing');
    }

    // In a real app we would call Stripe/Razorpay here and verify payment.
    // For MVP, simulate success and update company subscription status.

    // Determine plan duration based on billing cycle
    const durationDays = isYearly ? PLAN_DURATION.yearly : PLAN_DURATION.monthly;
    const planEndsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const billingCycle = isYearly ? 'yearly' : 'monthly';

    await prisma.company.update({
        where: { id: user.companyId },
        data: {
            subscriptionPlan: `${planName} (${billingCycle})`,
            subscriptionStatus: 'active',
            trialEndsAt: planEndsAt,
        },
    });

    res.json({
        success: true,
        message: `Successfully subscribed to ${planName} ${billingCycle} plan (${durationDays} days)`,
        data: {
            planName: `${planName} (${billingCycle})`,
            status: 'active',
            trialEndsAt: planEndsAt,
            durationDays,
        },
    });
});

/**
 * POST /api/subscription/trial
 * Starts a 7-day free trial for the company
 */
const startTrial = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });

    if (user.role !== 'recruiter') {
        throw ApiError.forbidden('Only recruiters can start a trial');
    }

    if (!user.companyId) {
        throw ApiError.badRequest('You must create a company profile first');
    }

    // Check if they already had a trial/subscription
    if (user.company.subscriptionStatus !== 'inactive') {
        throw ApiError.badRequest('Your company has already used a trial or has an active subscription');
    }

    const trialEndsAt = new Date(Date.now() + PLAN_DURATION.trial * 24 * 60 * 60 * 1000);

    await prisma.company.update({
        where: { id: user.companyId },
        data: {
            subscriptionPlan: 'Free Trial',
            subscriptionStatus: 'trialing',
            trialEndsAt,
        },
    });

    res.json({
        success: true,
        message: `${PLAN_DURATION.trial}-day free trial activated successfully`,
        data: {
            planName: 'Free Trial',
            status: 'trialing',
            trialEndsAt,
            durationDays: PLAN_DURATION.trial,
        },
    });
});

/**
 * GET /api/subscription/status
 * Fetches the current subscription details for the recruiter's company
 */
const getStatus = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { company: true },
    });

    if (user.role !== 'recruiter') {
        throw ApiError.forbidden('Only recruiters can have a subscription status');
    }

    if (!user.companyId) {
        return res.json({
            success: true,
            data: {
                hasCompany: false,
                status: 'inactive',
            },
        });
    }

    // Check if plan/trial has expired (for both 'active' and 'trialing')
    let status = user.company.subscriptionStatus;
    const now = new Date();

    if (
        (status === 'active' || status === 'trialing') &&
        user.company.trialEndsAt &&
        user.company.trialEndsAt < now
    ) {
        status = 'expired';
        // Auto update status to expired
        await prisma.company.update({
            where: { id: user.companyId },
            data: { subscriptionStatus: 'expired' },
        });
    }

    res.json({
        success: true,
        data: {
            hasCompany: true,
            companyId: user.companyId,
            planName: user.company.subscriptionPlan,
            status,
            trialEndsAt: user.company.trialEndsAt,
        },
    });
});

module.exports = {
    subscribe,
    startTrial,
    getStatus,
};
