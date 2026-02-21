const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { updateProfile } = require('../validators/general.validator');

router.get('/', auth, profileController.getProfile);
router.patch('/', auth, validate(updateProfile), profileController.updateProfile);
router.post('/resume', auth, upload.single('resume'), profileController.uploadResume);
router.post('/image', auth, upload.single('profileImage'), profileController.uploadProfileImage);
router.put('/education', auth, profileController.updateEducation);
router.put('/experience', auth, profileController.updateWorkExperience);
router.get('/preferences', auth, profileController.getPreferences);
router.patch('/preferences', auth, profileController.updatePreferences);
router.patch('/blocked-companies', auth, profileController.updateBlockedCompanies);
router.get('/:userId', auth, profileController.getPublicProfile);

module.exports = router;
