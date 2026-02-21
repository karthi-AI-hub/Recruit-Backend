const express = require('express');
const router = express.Router();
const appController = require('../controllers/application.controller');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const validate = require('../middleware/validate');
const { createApplication, updateApplicationStatus } = require('../validators/general.validator');

// ─── JOB SEEKER ─────────────────────────────────────────
router.post('/', auth, validate(createApplication), appController.createApplication);
router.get('/', auth, appController.getMyApplications);
router.get('/:id', auth, appController.getApplicationById);
router.delete('/:id', auth, appController.withdrawApplication);

// ─── RECRUITER ──────────────────────────────────────────
router.get('/job/:jobId', auth, roleGuard('recruiter'), appController.getJobApplications);
router.patch('/:id/status', auth, roleGuard('recruiter'), validate(updateApplicationStatus), appController.updateApplicationStatus);

module.exports = router;
