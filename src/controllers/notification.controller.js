const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');

/**
 * GET /api/notifications
 */
const getNotifications = asyncHandler(async (req, res) => {
    const pagination = paginate(req.query);

    const where = { userId: req.user.id };
    if (req.query.unreadOnly === 'true') {
        where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);

    res.json({
        success: true,
        data: notifications,
        unreadCount,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    });
});

/**
 * PATCH /api/notifications/:id/read
 */
const markAsRead = asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({
        where: { id: req.params.id },
    });

    if (!notification) throw ApiError.notFound('Notification not found');
    if (notification.userId !== req.user.id) throw ApiError.forbidden('Not your notification');

    await prisma.notification.update({
        where: { id: req.params.id },
        data: { isRead: true },
    });

    res.json({ success: true, message: 'Marked as read' });
});

/**
 * PATCH /api/notifications/read-all
 */
const markAllAsRead = asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
        where: { userId: req.user.id, isRead: false },
        data: { isRead: true },
    });

    res.json({ success: true, message: 'All notifications marked as read' });
});

/**
 * DELETE /api/notifications/:id
 */
const deleteNotification = asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({
        where: { id: req.params.id },
    });

    if (!notification) throw ApiError.notFound('Notification not found');
    if (notification.userId !== req.user.id) throw ApiError.forbidden('Not your notification');

    await prisma.notification.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Notification deleted' });
});

/**
 * POST /api/notifications/device — Register an FCM device token
 */
const registerDevice = asyncHandler(async (req, res) => {
    const { token, platform } = req.body;

    if (!token || !platform) {
        throw ApiError.badRequest('token and platform are required');
    }

    if (!['android', 'ios', 'web'].includes(platform)) {
        throw ApiError.badRequest('platform must be android, ios, or web');
    }

    // Upsert: if token already exists for this user, refresh updatedAt.
    // If token belongs to another user (re-install), reassign it.
    await prisma.deviceToken.upsert({
        where: { token },
        update: { userId: req.user.id, platform },
        create: { userId: req.user.id, token, platform },
    });

    res.json({ success: true, message: 'Device registered' });
});

/**
 * DELETE /api/notifications/device — Remove an FCM device token (logout)
 */
const removeDevice = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) throw ApiError.badRequest('token is required');

    await prisma.deviceToken.deleteMany({
        where: { token, userId: req.user.id },
    });

    res.json({ success: true, message: 'Device removed' });
});

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    registerDevice,
    removeDevice,
};