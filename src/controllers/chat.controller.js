const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { paginate, paginationMeta } = require('../utils/pagination');
const { createNotification } = require('../utils/notificationHelper');

const resolveUserName = async (userId, fallbackName) => {
    if (fallbackName && fallbackName.trim()) return fallbackName;
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
    });
    return user?.name || 'User';
};

const getRecruiterCompanyId = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });
    return user?.companyId || null;
};

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

    const recruiterCompanyId = await getRecruiterCompanyId(recruiterId);

    // Check if conversation already exists within company scope
    let conversation;
    if (jobId) {
        conversation = await prisma.conversation.findFirst({
            where: {
                candidateId,
                jobId,
                ...(recruiterCompanyId
                    ? { recruiter: { companyId: recruiterCompanyId } }
                    : { recruiterId }),
            }
        });
    } else {
        conversation = await prisma.conversation.findFirst({
            where: {
                candidateId,
                jobId: null,
                ...(recruiterCompanyId
                    ? { recruiter: { companyId: recruiterCompanyId } }
                    : { recruiterId }),
            }
        });
    }

    // Note: If unique constraint includes jobId and jobId can be null, we need to be careful.
    // The schema says @@unique([recruiterId, candidateId, jobId]).
    // Prisma treats nulls in unique constraints differently depending on DB.
    // Let's assume strict matching.

    if (!conversation) {
        const senderName = await resolveUserName(recruiterId, req.user.name);
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
                senderName,
                text: initialMessage,
                sentAt: new Date(),
            }
        });

        // Notify the candidate about the new conversation
        const senderLabel = await resolveUserName(recruiterId, req.user.name);
        await createNotification({
            userId: candidateId,
            title: 'New Message',
            message: `${senderLabel} started a conversation${jobTitle ? ` about ${jobTitle}` : ''}`,
            type: 'message',
            metadata: { conversationId: conversation.id, jobId },
        });
    }

    // Re-fetch with includes to return formatted data for the frontend
    const fullConversation = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        include: {
            recruiter: {
                select: { id: true, name: true, profileImage: true, company: { select: { name: true, logo: true } } }
            },
            candidate: {
                select: { id: true, name: true, profileImage: true }
            },
            job: {
                select: { id: true, title: true, companyName: true, companyLogo: true }
            }
        }
    });

    const formatted = {
        id: fullConversation.id,
        recruiterId: fullConversation.recruiterId,
        recruiterName: fullConversation.recruiter?.name,
        recruiterAvatar: fullConversation.recruiter?.profileImage,
        candidateId: fullConversation.candidateId,
        candidateName: fullConversation.candidate?.name,
        candidateAvatar: fullConversation.candidate?.profileImage,
        jobId: fullConversation.jobId,
        jobTitle: fullConversation.jobTitle || fullConversation.job?.title,
        companyName: fullConversation.job?.companyName || fullConversation.recruiter?.company?.name,
        companyLogo: fullConversation.job?.companyLogo || fullConversation.recruiter?.company?.logo,
        lastMessage: fullConversation.lastMessage,
        lastMessageAt: fullConversation.lastMessageAt,
        lastMessageBy: fullConversation.lastMessageBy,
        unreadCount: 0,
        isActive: fullConversation.isActive,
    };

    res.status(201).json({
        success: true,
        data: formatted
    });
});

/**
 * GET /api/chat/conversations
 * Get all conversations for the current user (paginated)
 */
const getConversations = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const isRecruiter = req.user.role === 'recruiter';
    const { skip, take, page, limit } = paginate(req.query);

    let where;
    if (isRecruiter) {
        const recruiterCompanyId = await getRecruiterCompanyId(userId);
        where = recruiterCompanyId
            ? { recruiter: { companyId: recruiterCompanyId } }
            : { recruiterId: userId };
    } else {
        where = { candidateId: userId };
    }

    const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
            where,
            orderBy: { lastMessageAt: 'desc' },
            skip,
            take,
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
        }),
        prisma.conversation.count({ where }),
    ]);

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
            // Role-aware unread count for the requesting user
            unreadCount: isRecruiter ? c.unreadRecruiter : c.unreadCandidate,
            isActive: c.isActive,
            // Extra fields for UI
            companyName,
            companyLogo
        };
    });

    res.json({
        success: true,
        data: formatted,
        pagination: paginationMeta(total, page, limit),
    });
});

/**
 * GET /api/chat/:conversationId/messages
 * Get messages for a conversation (paginated, newest first)
 */
const getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify access
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
            recruiter: { select: { companyId: true } },
        },
    });

    if (!conversation) throw ApiError.notFound('Conversation not found');
    let canAccess = conversation.recruiterId === userId || conversation.candidateId === userId;
    if (!canAccess && req.user.role === 'recruiter') {
        const recruiterCompanyId = await getRecruiterCompanyId(userId);
        canAccess = !!recruiterCompanyId && recruiterCompanyId === conversation.recruiter?.companyId;
    }
    if (!canAccess) {
        throw ApiError.forbidden('Access denied');
    }

    const { skip, take, page, limit } = paginate(req.query);

    const [messages, total] = await Promise.all([
        prisma.chatMessage.findMany({
            where: { conversationId },
            orderBy: { sentAt: 'desc' }, // newest first for pagination
            skip,
            take,
        }),
        prisma.chatMessage.count({ where: { conversationId } }),
    ]);

    res.json({
        success: true,
        data: messages.reverse(), // return in chronological order
        pagination: paginationMeta(total, page, limit),
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
    const userName = await resolveUserName(userId, req.user.name);

    if (!text) throw ApiError.badRequest('Message text is required');

    // Verify conversation
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
            recruiter: { select: { companyId: true } },
        },
    });

    if (!conversation) throw ApiError.notFound('Conversation not found');
    let canAccess = conversation.recruiterId === userId || conversation.candidateId === userId;
    if (!canAccess && req.user.role === 'recruiter') {
        const recruiterCompanyId = await getRecruiterCompanyId(userId);
        canAccess = !!recruiterCompanyId && recruiterCompanyId === conversation.recruiter?.companyId;
    }
    if (!canAccess) {
        throw ApiError.forbidden('Access denied');
    }

    // Determine counts to update
    const isRecruiter = req.user.role === 'recruiter';

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
        include: {
            recruiter: { select: { companyId: true } },
        },
    });

    if (!conversation) throw ApiError.notFound('Conversation not found');
    let canAccess = conversation.recruiterId === userId || conversation.candidateId === userId;
    if (!canAccess && req.user.role === 'recruiter') {
        const recruiterCompanyId = await getRecruiterCompanyId(userId);
        canAccess = !!recruiterCompanyId && recruiterCompanyId === conversation.recruiter?.companyId;
    }
    if (!canAccess) {
        throw ApiError.forbidden('Access denied');
    }

    const isRecruiter = req.user.role === 'recruiter';

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
