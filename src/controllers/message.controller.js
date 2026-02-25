const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');

/**
 * POST /api/messages — Send a message (recruiter → candidate)
 */
const sendMessage = asyncHandler(async (req, res) => {
    const { toUserId, subject, body, templateId } = req.body;

    if (!toUserId || !subject || !body) {
        throw ApiError.badRequest('toUserId, subject, and body are required');
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!recipient) throw ApiError.notFound('Recipient not found');

    const message = await prisma.message.create({
        data: {
            fromUserId: req.user.id,
            toUserId,
            subject,
            body,
            templateId,
        },
    });

    // Create notification
    await prisma.notification.create({
        data: {
            userId: toUserId,
            title: 'New Message',
            message: subject,
            type: 'message',
            metadata: { messageId: message.id },
        },
    });

    res.status(201).json({
        success: true,
        message: 'Message sent',
        data: message,
    });
});

/**
 * POST /api/messages/bulk — Send bulk messages
 */
const sendBulkMessages = asyncHandler(async (req, res) => {
    const { toUserIds, subject, body, templateId, placeholders } = req.body;

    if (!toUserIds || !Array.isArray(toUserIds) || toUserIds.length === 0) {
        throw ApiError.badRequest('toUserIds must be a non-empty array');
    }
    if (!subject || !body) {
        throw ApiError.badRequest('subject and body are required');
    }

    // ── Safety Check: Filter only existing users ─────────────────────────
    const existingUsers = await prisma.user.findMany({
        where: { id: { in: toUserIds } },
        select: { id: true }
    });
    const validUserIds = existingUsers.map(u => u.id);

    if (validUserIds.length === 0) {
        throw ApiError.notFound('No valid recipients found');
    }

    const messages = [];
    for (const toUserId of validUserIds) {
        // Replace placeholders in body if needed
        let personalizedBody = body;
        if (placeholders) {
            Object.entries(placeholders).forEach(([key, value]) => {
                personalizedBody = personalizedBody.replace(new RegExp(`{{${key}}}`, 'g'), value);
            });
        }

        const msg = await prisma.message.create({
            data: {
                fromUserId: req.user.id,
                toUserId,
                subject,
                body: personalizedBody,
                templateId,
            },
        });
        messages.push(msg);

        // Create notification
        await prisma.notification.create({
            data: {
                userId: toUserId,
                title: 'New Message',
                message: subject,
                type: 'message',
                metadata: { messageId: msg.id },
            },
        });
    }

    res.status(201).json({
        success: true,
        message: `${messages.length} messages sent`,
        data: { count: messages.length },
    });
});

/**
 * GET /api/messages — Get my messages (inbox)
 */
const getMessages = asyncHandler(async (req, res) => {
    const pagination = paginate(req.query);

    const where = { toUserId: req.user.id };

    const [messages, total] = await Promise.all([
        prisma.message.findMany({
            where,
            orderBy: { sentAt: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
            include: {
                from: {
                    select: { id: true, name: true, profileImage: true },
                },
            },
        }),
        prisma.message.count({ where }),
    ]);

    res.json({
        success: true,
        data: messages,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    });
});

/**
 * GET /api/messages/sent — Sent messages
 */
const getSentMessages = asyncHandler(async (req, res) => {
    const pagination = paginate(req.query);

    const where = { fromUserId: req.user.id };

    const [messages, total] = await Promise.all([
        prisma.message.findMany({
            where,
            orderBy: { sentAt: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
            include: {
                to: {
                    select: { id: true, name: true, profileImage: true },
                },
            },
        }),
        prisma.message.count({ where }),
    ]);

    res.json({
        success: true,
        data: messages,
        pagination: paginationMeta(total, pagination.page, pagination.limit),
    });
});

/**
 * PATCH /api/messages/:id/read — Mark message as read
 */
const markAsRead = asyncHandler(async (req, res) => {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) throw ApiError.notFound('Message not found');
    if (message.toUserId !== req.user.id) throw ApiError.forbidden('Not your message');

    await prisma.message.update({
        where: { id: req.params.id },
        data: { isRead: true },
    });

    res.json({ success: true, message: 'Marked as read' });
});

/**
 * GET /api/messages/unread-count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
    const count = await prisma.message.count({
        where: { toUserId: req.user.id, isRead: false },
    });

    res.json({ success: true, data: { unreadCount: count } });
});

module.exports = {
    sendMessage,
    sendBulkMessages,
    getMessages,
    getSentMessages,
    markAsRead,
    getUnreadCount,
};
