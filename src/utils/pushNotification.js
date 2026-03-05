/**
 * Push Notification Utility
 *
 * Sends FCM push notifications to a user's registered devices.
 * Automatically cleans up invalid / expired tokens.
 */
const { prisma } = require('../config/database');
const { getMessaging } = require('../config/firebase');

/**
 * Send push notification to all devices of a user.
 *
 * @param {string}   userId
 * @param {Object}   payload
 * @param {string}   payload.title
 * @param {string}   payload.body
 * @param {Object}   [payload.data]  — key‑value string pairs for the client
 * @returns {Promise<{success: number, failure: number}>}
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
    const messaging = getMessaging();
    if (!messaging) return { success: 0, failure: 0 };

    const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId },
        select: { id: true, token: true },
    });

    if (deviceTokens.length === 0) return { success: 0, failure: 0 };

    // Stringify all data values (FCM requires string‑only)
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
        stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }

    const message = {
        notification: { title, body },
        data: stringData,
        tokens: deviceTokens.map((d) => d.token),
    };

    try {
        const response = await messaging.sendEachForMulticast(message);

        // Remove invalid tokens
        const tokensToDelete = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code;
                if (
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered'
                ) {
                    tokensToDelete.push(deviceTokens[idx].id);
                }
            }
        });

        if (tokensToDelete.length > 0) {
            await prisma.deviceToken.deleteMany({
                where: { id: { in: tokensToDelete } },
            });
        }

        return { success: response.successCount, failure: response.failureCount };
    } catch (err) {
        const logger = require('../config/logger');
        logger.error('Push notification error:', err.message);
        return { success: 0, failure: deviceTokens.length };
    }
}

/**
 * Send push notification to multiple users at once.
 *
 * @param {string[]} userIds
 * @param {Object}   payload  — same shape as sendPushToUser
 */
async function sendPushToUsers(userIds, payload) {
    await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)));
}

module.exports = { sendPushToUser, sendPushToUsers };
