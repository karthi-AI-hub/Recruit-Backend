const express = require('express');
const auth = require('../middleware/auth');
const subscriptionController = require('../controllers/subscription.controller');

const router = express.Router();

// All subscription routes require authentication
router.use(auth);

router.post('/subscribe', subscriptionController.subscribe);
router.post('/trial', subscriptionController.startTrial);
router.get('/status', subscriptionController.getStatus);

module.exports = router;
