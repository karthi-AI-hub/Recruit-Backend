const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/chat/start
 * Start a conversation (Recruiter only)
 */
const startConversation = asyncHandler(async (req, res) => {
    const { candidateId, jobId, initialMessage } = req.body;
    const recruiterId = req.user.id; // From auth middleware

    if (!candidateId || !initialMessage) {
        throw ApiError.badRequest('Candidate ID and initial message are required');
    }

    // Check if conversation already exists
    let conversation;
    if (jobId) {
        conversation = await prisma.conversation.findUnique({
            where: {
                recruiterId_candidateId_jobId: {
                    recruiterId,
                    candidateId,
                    jobId
                }
            }
        });
    } else {
        conversation = await prisma.conversation.findFirst({
            where: {
                recruiterId,
                candidateId,
                jobId: null
            }
        });
    }

    // Note: If unique constraint includes jobId and jobId can be null, we need to be careful.
    // The schema says @@unique([recruiterId, candidateId, jobId]).
    // Prisma treats nulls in unique constraints differently depending on DB.
    // Let's assume strict matching.

    if (!conversation) {
        // Create new conversation
        // Get job details if provided to populate snapshot fields
        let jobTitle = null;
        if (jobId) {
            const job = await prisma.job.findUnique({ where: { id: jobId } });
            jobTitle = job ? job.title : null;
        }

        conversation = await prisma.conversation.create({
            data: {
                recruiterId,
                candidateId,
                jobId,
                jobTitle,
                lastMessage: initialMessage,
                lastMessageAt: new Date(),
                lastMessageBy: recruiterId,
                unreadCandidate: 1,
                unreadRecruiter: 0,
            }
        });

        // Create initial message
        await prisma.chatMessage.create({
            data: {
                conversationId: conversation.id,
                senderId: recruiterId,
                senderName: req.user.name,
                text: initialMessage,
                sentAt: new Date(),
            }
        });
    }

    res.status(201).json({
        success: true,
        data: conversation
    });
});

/**
 * GET /api/chat/conversations
 * Get all conversations for the current user
 */
const getConversations = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const isRecruiter = req.user.role === 'recruiter';

    const where = isRecruiter ? { recruiterId: userId } : { candidateId: userId };

    const conversations = await prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        include: {
            recruiter: {
                select: {
                    id: true,
                    name: true,
                    profileImage: true,
                    company: {
                        select: { name: true, logo: true }
                    }
                }
            },
            candidate: {
                select: {
                    id: true,
                    name: true,
                    profileImage: true,
                }
            },
            job: {
                select: {
                    id: true,
                    title: true,
                    companyName: true,
                    companyLogo: true
                }
            }
        }
    });

    // Format for frontend
    const formatted = conversations.map(c => {
        // Determine company name/logo to show to candidate
        let companyName = null;
        let companyLogo = null;

        if (!isRecruiter) {
            // Prefer job's snapshot, then recruiter's current company
            companyName = c.job?.companyName || c.recruiter?.company?.name;
            companyLogo = c.job?.companyLogo || c.recruiter?.company?.logo;
        }

        return {
            id: c.id,
            recruiterId: c.recruiterId,
            recruiterName: c.recruiter.name,
            recruiterAvatar: c.recruiter.profileImage,
            candidateId: c.candidateId,
            candidateName: c.candidate.name,
            candidateAvatar: c.candidate.profileImage,
            jobId: c.jobId,
            jobTitle: c.jobTitle || c.job?.title,
            lastMessage: c.lastMessage,
            lastMessageAt: c.lastMessageAt,
            lastMessageBy: c.lastMessageBy,
            unreadRecruiter: c.unreadRecruiter,
            unreadCandidate: c.unreadCandidate,
            isActive: c.isActive,
            // Extra fields for UI
            companyName,
            companyLogo
        };
    });

    res.json({
        success: true,
        data: formatted
    });
});

/**
 * GET /api/chat/:conversationId/messages
 * Get messages for a conversation
 */
const getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify access
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) throw ApiError.notFound('Conversation not found');
    if (conversation.recruiterId !== userId && conversation.candidateId !== userId) {
        throw ApiError.forbidden('Access denied');
    }

    const messages = await prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { sentAt: 'asc' }, // Chronological order
    });

    res.json({
        success: true,
        data: messages
    });
});

/**
 * POST /api/chat/:conversationId/messages
 * Send a message
 */
const sendMessage = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;

    if (!text) throw ApiError.badRequest('Message text is required');

    // Verify conversation
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) throw ApiError.notFound('Conversation not found');
    if (conversation.recruiterId !== userId && conversation.candidateId !== userId) {
        throw ApiError.forbidden('Access denied');
    }

    // Determine counts to update
    const isRecruiter = userId === conversation.recruiterId;

    // Create message AND update conversation in transaction
    const [message, updatedConv] = await prisma.$transaction([
        prisma.chatMessage.create({
            data: {
                conversationId,
                senderId: userId,
                senderName: userName,
                text,
                sentAt: new Date(),
            }
        }),
        prisma.conversation.update({
            where: { id: conversationId },
            data: {
                lastMessage: text,
                lastMessageAt: new Date(),
                lastMessageBy: userId,
                unreadRecruiter: isRecruiter ? conversation.unreadRecruiter : conversation.unreadRecruiter + 1,
                unreadCandidate: isRecruiter ? conversation.unreadCandidate + 1 : conversation.unreadCandidate,
            }
        })
    ]);

    res.status(201).json({
        success: true,
        data: message
    });
});

/**
 * PATCH /api/chat/:conversationId/read
 * Mark conversation as read
 */
const markAsRead = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) throw ApiError.notFound('Conversation not found');
    if (conversation.recruiterId !== userId && conversation.candidateId !== userId) {
        throw ApiError.forbidden('Access denied');
    }

    const isRecruiter = userId === conversation.recruiterId;

    // Reset unread count
    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            [isRecruiter ? 'unreadRecruiter' : 'unreadCandidate']: 0
        }
    });

    // Mark all messages from OTHER party as read
    await prisma.chatMessage.updateMany({
        where: {
            conversationId,
            senderId: { not: userId },
            status: { not: 'read' }
        },
        data: {
            status: 'read',
            readAt: new Date()
        }
    });

    res.json({ success: true });
});

module.exports = {
    startConversation,
    getConversations,
    getMessages,
    sendMessage,
    markAsRead
};
