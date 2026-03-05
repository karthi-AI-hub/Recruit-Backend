const express = require('express');
const router = express.Router();
const notifController = require('../controllers/notification.controller');
const auth = require('../middleware/auth');

router.get('/', auth, notifController.getNotifications);
router.patch('/read-all', auth, notifController.markAllAsRead);
router.post('/device', auth, notifController.registerDevice);
router.delete('/device', auth, notifController.removeDevice);
router.patch('/:id/read', auth, notifController.markAsRead);
router.delete('/:id', auth, notifController.deleteNotification);

module.exports = router;
