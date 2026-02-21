const express = require('express');
const router = express.Router();
const jobController = require('../controllers/job.controller');
const optionalAuth = require('../middleware/optionalAuth');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const validate = require('../middleware/validate');
const jobValidator = require('../validators/job.validator');

// ─── PUBLIC (Guest OK) ──────────────────────────────────
router.get('/', validate(jobValidator.jobFilters, 'query'), optionalAuth, jobController.getJobs);
router.get('/search', optionalAuth, jobController.searchJobs);
router.get('/:id', optionalAuth, jobController.getJobById);

// ─── RECRUITER ONLY ─────────────────────────────────────
router.post('/', auth, roleGuard('recruiter'), validate(jobValidator.createJob), jobController.createJob);
router.get('/recruiter/mine', auth, roleGuard('recruiter'), jobController.getRecruiterJobs);
router.patch('/:id', auth, roleGuard('recruiter'), validate(jobValidator.updateJob), jobController.updateJob);
router.delete('/:id', auth, roleGuard('recruiter'), jobController.deleteJob);

module.exports = router;
