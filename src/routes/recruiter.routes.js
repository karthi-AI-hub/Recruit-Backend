const express = require('express');
const router = express.Router();
const recruiterController = require('../controllers/recruiter.controller');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

router.get('/dashboard', auth, roleGuard('recruiter'), recruiterController.getDashboard);
router.get('/analytics', auth, roleGuard('recruiter'), recruiterController.getAnalytics);
router.get('/candidates', auth, roleGuard('recruiter'), recruiterController.searchCandidates);
router.get('/company', auth, roleGuard('recruiter'), recruiterController.getOwnCompanyProfile);
router.put('/company', auth, roleGuard('recruiter'), recruiterController.updateCompanyProfile);
router.post('/company/logo', auth, roleGuard('recruiter'), require('../middleware/upload').single('companyLogo'), recruiterController.uploadCompanyLogo);
router.get('/company/:id', recruiterController.getCompanyProfile);
router.get('/team', auth, roleGuard('recruiter'), recruiterController.getTeamMembers);
router.post('/team/invite', auth, roleGuard('recruiter'), recruiterController.inviteTeamMember);
router.get('/team/invites', auth, roleGuard('recruiter'), recruiterController.getTeamInvites);
router.post('/team/invite/accept', auth, roleGuard('recruiter'), recruiterController.acceptTeamInvite);
router.delete('/team/:memberId', auth, roleGuard('recruiter'), recruiterController.removeTeamMember);

module.exports = router;
