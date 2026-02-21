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

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};
