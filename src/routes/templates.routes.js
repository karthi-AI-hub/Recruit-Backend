const express = require('express');
const router = express.Router();
const templateController = require('../controllers/template.controller');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const validate = require('../middleware/validate');
const { createTemplate, updateTemplate } = require('../validators/general.validator');

router.get('/', auth, roleGuard('recruiter'), templateController.getTemplates);
router.get('/:id', auth, roleGuard('recruiter'), templateController.getTemplateById);
router.post('/', auth, roleGuard('recruiter'), validate(createTemplate), templateController.createTemplate);
router.patch('/:id', auth, roleGuard('recruiter'), validate(updateTemplate), templateController.updateTemplate);
router.delete('/:id', auth, roleGuard('recruiter'), templateController.deleteTemplate);

module.exports = router;
