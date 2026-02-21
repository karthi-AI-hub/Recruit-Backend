const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const auth = require('../middleware/auth');

// Submit feedback (any authenticated user)
router.post('/', auth, feedbackController.submitFeedback);

module.exports = router;
