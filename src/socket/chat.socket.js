const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const { prisma } = require('../config/database');
const { sendPushToUser } = require('../utils/pushNotification');
const { createNotification } = require('../utils/notificationHelper');

/**
 * Initialize Socket.io chat handlers.
 * JWT auth is performed during the handshake.
 */
const initChatSocket = (io) => {
    // JWT auth middleware for Socket.io
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            socket.user = decoded;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        logger.info(`🔌 User connected: ${userId}`);

        // Join user's personal room for notifications
        socket.join(`user:${userId}`);

        /**
         * Acknowledge receipt of a message (client → server).
         * Lightweight: marks a single message as 'delivered'.
         */
        socket.on('ack_message', async ({ messageId, conversationId }) => {
            try {
                if (!messageId || !conversationId) return;
                const msg = await prisma.chatMessage.findUnique({
                    where: { id: messageId },
                    select: { status: true, senderId: true },
                });
                // Only upgrade sent → delivered (ignore if already delivered/read)
                if (!msg || msg.status !== 'sent' || msg.senderId === userId) return;

                await prisma.chatMessage.update({
                    where: { id: messageId },
                    data: { status: 'delivered' },
                });
                io.to(`conv:${conversationId}`).emit('message_status_updated', {
                    messageId,
                    conversationId,
                    status: 'delivered',
                });
            } catch (err) {
                logger.error('ack_message error:', err.message);
            }
        });

        /**
         * Join a conversation room
         */
        socket.on('join_conversation', async (conversationId) => {
            try {
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                });

                if (!conversation) return socket.emit('error', 'Conversation not found');

                // Verify user is part of this conversation
                if (conversation.recruiterId !== userId && conversation.candidateId !== userId) {
                    return socket.emit('error', 'Access denied');
                }

                socket.join(`conv:${conversationId}`);
                socket.emit('joined_conversation', conversationId);

                // Auto-deliver any undelivered messages from the other party
                const delivered = await prisma.chatMessage.updateMany({
                    where: {
                        conversationId,
                        senderId: { not: userId },
                        status: 'sent',
                    },
                    data: { status: 'delivered' },
                });

                if (delivered.count > 0) {
                    io.to(`conv:${conversationId}`).emit('messages_delivered', {
                        conversationId,
                        deliveredTo: userId,
                    });
                }
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        /**
         * Leave a conversation room
         */
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conv:${conversationId}`);
        });

        /**
         * Send a message
         */
        socket.on('send_message', async (data) => {
            const { conversationId, text, type = 'text' } = data;

            try {
                // Verify participation
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                });

                if (!conversation) return socket.emit('error', 'Conversation not found');
                if (conversation.recruiterId !== userId && conversation.candidateId !== userId) {
                    return socket.emit('error', 'Access denied');
                }

                // Create message
                const message = await prisma.chatMessage.create({
                    data: {
                        conversationId,
                        senderId: userId,
                        senderName: socket.user.name || 'User',
                        text,
                        type,
                    },
                });

                // Update conversation
                const isRecruiter = conversation.recruiterId === userId;
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: {
                        lastMessage: text,
                        lastMessageAt: new Date(),
                        lastMessageBy: userId,
                        ...(isRecruiter
                            ? { unreadCandidate: { increment: 1 } }
                            : { unreadRecruiter: { increment: 1 } }),
                    },
                });

                // Broadcast to conversation room
                io.to(`conv:${conversationId}`).emit('new_message', message);

                // Delivery is handled by the receiver's ack_message event.
                // Notify the other user via their personal room.
                const otherUserId = isRecruiter ? conversation.candidateId : conversation.recruiterId;
                io.to(`user:${otherUserId}`).emit('message_notification', {
                    conversationId,
                    message: text,
                    senderName: socket.user.name || 'User',
                });

                // Send push notification if the other user is not in the conversation room
                const convRoom = io.sockets.adapter.rooms.get(`conv:${conversationId}`);
                const otherUserSockets = await io.in(`user:${otherUserId}`).fetchSockets();
                const otherInRoom = otherUserSockets.some((s) => convRoom?.has(s.id));

                if (!otherInRoom) {
                    sendPushToUser(otherUserId, {
                        title: socket.user.name || 'New Message',
                        body: text.length > 100 ? text.substring(0, 100) + '…' : text,
                        data: { type: 'chat', conversationId },
                    }).catch(() => {});
                }
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        /**
         * Typing indicator
         */
        socket.on('typing', (data) => {
            const { conversationId, isTyping } = data;
            socket.to(`conv:${conversationId}`).emit('user_typing', {
                userId,
                isTyping,
            });
        });

        /**
         * Mark conversation as read
         */
        socket.on('mark_read', async (conversationId) => {
            try {
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                });

                if (!conversation) return;

                const isRecruiter = conversation.recruiterId === userId;

                // Reset unread count for this user
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: isRecruiter
                        ? { unreadRecruiter: 0 }
                        : { unreadCandidate: 0 },
                });

                // Mark all messages as read
                await prisma.chatMessage.updateMany({
                    where: {
                        conversationId,
                        senderId: { not: userId },
                        status: { not: 'read' },
                    },
                    data: {
                        status: 'read',
                        readAt: new Date(),
                    },
                });

                socket.emit('conversation_read', conversationId);

                io.to(`conv:${conversationId}`).emit('messages_read', {
                    conversationId,
                    readBy: userId,
                });
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        /**
         * Get conversations list (REST fallback via socket)
         */
        socket.on('get_conversations', async () => {
            try {
                const conversations = await prisma.conversation.findMany({
                    where: {
                        OR: [
                            { recruiterId: userId },
                            { candidateId: userId },
                        ],
                        isActive: true,
                    },
                    orderBy: { lastMessageAt: 'desc' },
                    include: {
                        recruiter: {
                            select: { id: true, name: true, profileImage: true },
                        },
                        candidate: {
                            select: { id: true, name: true, profileImage: true },
                        },
                    },
                });

                socket.emit('conversations_list', conversations);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        /**
         * Start a new conversation (recruiter only)
         */
        socket.on('start_conversation', async (data) => {
            const { candidateId, jobId, jobTitle, initialMessage } = data;

            try {
                if (socket.user.role !== 'recruiter') {
                    return socket.emit('error', 'Only recruiters can start conversations');
                }

                // Check if conversation already exists
                const existing = await prisma.conversation.findUnique({
                    where: {
                        recruiterId_candidateId: { recruiterId: userId, candidateId },
                    },
                });

                if (existing) {
                    // Send message to existing conversation
                    socket.emit('conversation_exists', existing);
                    return;
                }

                // Get names
                const [recruiter, candidate] = await Promise.all([
                    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
                    prisma.user.findUnique({ where: { id: candidateId }, select: { name: true } }),
                ]);

                // Create conversation
                const conversation = await prisma.conversation.create({
                    data: {
                        recruiterId: userId,
                        candidateId,
                        jobId,
                        jobTitle,
                        lastMessage: initialMessage || 'Conversation started',
                        lastMessageAt: new Date(),
                        lastMessageBy: userId,
                        unreadCandidate: initialMessage ? 1 : 0,
                    },
                });

                // Send initial message if provided
                if (initialMessage) {
                    await prisma.chatMessage.create({
                        data: {
                            conversationId: conversation.id,
                            senderId: userId,
                            senderName: recruiter?.name || 'Recruiter',
                            text: initialMessage,
                        },
                    });
                }

                socket.emit('conversation_started', conversation);

                // Notify candidate via in-app notification
                if (initialMessage) {
                    createNotification({
                        userId: candidateId,
                        title: 'New Message',
                        message: `${recruiter?.name || 'A recruiter'} started a conversation${jobTitle ? ` about ${jobTitle}` : ''}`,
                        type: 'message',
                        metadata: { conversationId: conversation.id, jobId },
                    }).catch(() => {});
                }

                // Notify candidate via socket
                io.to(`user:${candidateId}`).emit('new_conversation', {
                    conversation,
                    recruiterName: recruiter?.name,
                });
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('disconnect', () => {
            logger.info(`🔌 User disconnected: ${userId}`);
        });
    });
};

module.exports = initChatSocket;
