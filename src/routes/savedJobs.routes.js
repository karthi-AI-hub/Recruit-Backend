const express = require('express');
const router = express.Router();
const savedJobController = require('../controllers/savedJob.controller');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

const { cacheMiddleware, CACHE_TTL } = require('../middleware/cache.middleware');

router.get('/', auth, cacheMiddleware((req) => `saved:${req.user.id}`, CACHE_TTL.SAVED), savedJobController.getSavedJobs);
router.post('/:jobId', auth, roleGuard('job_seeker'), savedJobController.toggleSavedJob);

module.exports = router;
