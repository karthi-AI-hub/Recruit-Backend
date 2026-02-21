const express = require('express');
const router = express.Router();
const msgController = require('../controllers/message.controller');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const validate = require('../middleware/validate');
const { sendMessage, sendBulkMessages } = require('../validators/general.validator');

router.get('/', auth, msgController.getMessages);
router.get('/sent', auth, msgController.getSentMessages);
router.get('/unread-count', auth, msgController.getUnreadCount);
router.post('/', auth, roleGuard('recruiter'), validate(sendMessage), msgController.sendMessage);
router.post('/bulk', auth, roleGuard('recruiter'), validate(sendBulkMessages), msgController.sendBulkMessages);
router.patch('/:id/read', auth, msgController.markAsRead);

module.exports = router;