const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/feedback — Submit user feedback
 */
const submitFeedback = asyncHandler(async (req, res) => {
    const { category, rating, message } = req.body;

    if (!message || message.trim().length === 0) {
        throw ApiError.badRequest('Feedback message is required');
    }

    if (!category) {
        throw ApiError.badRequest('Category is required');
    }

    const feedback = await prisma.feedback.create({
        data: {
            userId: req.user.id,
            category,
            rating: rating || 0,
            message: message.trim(),
        },
    });

    res.status(201).json({
        success: true,
        message: 'Thank you! Your feedback has been received.',
        data: feedback,
    });
});

module.exports = {
    submitFeedback,
};
