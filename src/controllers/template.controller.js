const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/templates — Create message template
 */
const createTemplate = asyncHandler(async (req, res) => {
    if (!req.body.title || !req.body.body) {
        throw ApiError.badRequest('title and body are required');
    }

    const template = await prisma.messageTemplate.create({
        data: {
            ...req.body,
            createdById: req.user.id,
        },
    });

    res.status(201).json({
        success: true,
        message: 'Template created',
        data: template,
    });

});

/**
 * GET /api/templates — Get all templates for user
 */
const getTemplates = asyncHandler(async (req, res) => {
    const templates = await prisma.messageTemplate.findMany({
        where: {
            OR: [
                { createdById: req.user.id },
                { isDefault: true },
            ],
        },
        orderBy: { createdAt: 'desc' },
    });

    res.json({
        success: true,
        data: templates,
    });
});

/**
 * GET /api/templates/:id
 */
const getTemplateById = asyncHandler(async (req, res) => {
    const template = await prisma.messageTemplate.findUnique({
        where: { id: req.params.id },
    });

    if (!template) throw ApiError.notFound('Template not found');

    res.json({ success: true, data: template });
});

/**
 * PATCH /api/templates/:id
 */
const updateTemplate = asyncHandler(async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        throw ApiError.badRequest('No fields to update');
    }

    const template = await prisma.messageTemplate.findUnique({

        where: { id: req.params.id },
    });

    if (!template) throw ApiError.notFound('Template not found');
    if (template.createdById !== req.user.id) throw ApiError.forbidden('Not your template');

    const updated = await prisma.messageTemplate.update({
        where: { id: req.params.id },
        data: req.body,
    });

    res.json({
        success: true,
        message: 'Template updated',
        data: updated,
    });
});

/**
 * DELETE /api/templates/:id
 */
const deleteTemplate = asyncHandler(async (req, res) => {
    const template = await prisma.messageTemplate.findUnique({
        where: { id: req.params.id },
    });

    if (!template) throw ApiError.notFound('Template not found');
    if (template.createdById !== req.user.id) throw ApiError.forbidden('Not your template');

    await prisma.messageTemplate.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Template deleted' });
});

module.exports = {
    createTemplate,
    getTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate,
};
