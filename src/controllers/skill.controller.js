const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/skills?q=flutter
 * Search skills by partial match, ordered by usageCount desc.
 * Returns top 20 matches. If no query, returns top 20 popular skills.
 */
const searchSkills = asyncHandler(async (req, res) => {
    const query = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    let skills;
    if (query.length > 0) {
        skills = await prisma.skill.findMany({
            where: {
                name: {
                    contains: query,
                    mode: 'insensitive',
                },
            },
            orderBy: { usageCount: 'desc' },
            take: limit,
            select: { id: true, name: true, category: true, usageCount: true },
        });
    } else {
        skills = await prisma.skill.findMany({
            orderBy: { usageCount: 'desc' },
            take: limit,
            select: { id: true, name: true, category: true, usageCount: true },
        });
    }

    res.json({
        success: true,
        data: skills,
    });
});

/**
 * GET /api/skills/popular
 * Return top 30 most-used skills (for "Popular Skills" section)
 */
const getPopularSkills = asyncHandler(async (req, res) => {
    const skills = await prisma.skill.findMany({
        orderBy: { usageCount: 'desc' },
        take: 30,
        select: { id: true, name: true, category: true, usageCount: true },
    });

    res.json({
        success: true,
        data: skills,
    });
});

/**
 * POST /api/skills
 * Add a new skill. If it already exists (case-insensitive), return the existing one.
 * Expects: { name: "Flutter", category?: "Framework" }
 */
const addSkill = asyncHandler(async (req, res) => {
    const { name, category } = req.body;

    if (!name || name.trim().length === 0) {
        throw ApiError.badRequest('Skill name is required');
    }

    const trimmedName = name.trim();

    // Check if skill already exists (case-insensitive)
    const existing = await prisma.skill.findFirst({
        where: {
            name: {
                equals: trimmedName,
                mode: 'insensitive',
            },
        },
    });

    if (existing) {
        return res.json({
            success: true,
            message: 'Skill already exists',
            data: existing,
        });
    }

    // Create new skill
    const skill = await prisma.skill.create({
        data: {
            name: trimmedName,
            category: category || null,
        },
    });

    res.status(201).json({
        success: true,
        message: 'Skill added',
        data: skill,
    });
});

module.exports = {
    searchSkills,
    getPopularSkills,
    addSkill,
};
