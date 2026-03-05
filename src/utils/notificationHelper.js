/**
 * Notification Helper
 *
 * Creates a Notification record in the database, emits a real-time
 * socket event (`new_notification`) to the target user, and sends
 * an FCM push notification — all in one call.
 */
const { prisma } = require('../config/database');
const { getIO } = require('../socket/io');
const { sendPushToUser } = require('./pushNotification');

/**
 * Create a notification and broadcast it in real-time.
 *
 * @param {Object}  opts
 * @param {string}  opts.userId    — recipient user id
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {string}  [opts.type='info'] — NotificationType enum value
 * @param {Object}  [opts.metadata]    — JSON metadata (jobId, applicationId, etc.)
 * @returns {Promise<Object>} the created Notification record
 */
async function createNotification({ userId, title, message, type = 'info', metadata = null }) {
    const notification = await prisma.notification.create({
        data: {
            userId,
            title,
            message,
            type,
            metadata,
        },
    });

    // Emit real-time event via Socket.io
    const io = getIO();
    if (io) {
        io.to(`user:${userId}`).emit('new_notification', {
            id: notification.id,
            userId: notification.userId,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            isRead: notification.isRead,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
        });
    }

    // FCM push notification (fire-and-forget)
    const stringData = {};
    if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
            stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
    }
    sendPushToUser(userId, {
        title,
        body: message,
        data: { type, ...stringData },
    }).catch(() => {});

    return notification;
}

module.exports = { createNotification };
