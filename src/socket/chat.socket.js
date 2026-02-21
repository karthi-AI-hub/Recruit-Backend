const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { prisma } = require('../config/database');

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
        console.log(`🔌 User connected: ${userId}`);

        // Join user's personal room for notifications
        socket.join(`user:${userId}`);

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

                // Notify the other user
                const otherUserId = isRecruiter ? conversation.candidateId : conversation.recruiterId;
                io.to(`user:${otherUserId}`).emit('message_notification', {
                    conversationId,
                    message: text,
                    senderName: socket.user.name || 'User',
                });
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

                // Notify candidate
                io.to(`user:${candidateId}`).emit('new_conversation', {
                    conversation,
                    recruiterName: recruiter?.name,
                });
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${userId}`);
        });
    });
};

module.exports = initChatSocket;
