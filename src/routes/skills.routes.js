const express = require('express');
const router = express.Router();
const skillController = require('../controllers/skill.controller');
const auth = require('../middleware/auth');

// Search skills (authenticated users only)
router.get('/', auth, skillController.searchSkills);

// Get popular skills
router.get('/popular', auth, skillController.getPopularSkills);

// Add a new skill
router.post('/', auth, skillController.addSkill);

module.exports = router;
