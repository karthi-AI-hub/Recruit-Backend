const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// All routes require authentication
router.use(auth);

// Start conversation (Recruiter only)
router.post('/start', roleGuard('recruiter'), chatController.startConversation);

// Get conversations
router.get('/', chatController.getConversations);

// Message history
router.get('/:conversationId/messages', chatController.getMessages);

// Send message
router.post('/:conversationId/messages', chatController.sendMessage);

// Mark as read
router.patch('/:conversationId/read', chatController.markAsRead);

module.exports = router;
