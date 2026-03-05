const { prisma } = require('../config/database');

function normalizeSkillName(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ');
}

function toCanonicalDisplayName(value) {
    return normalizeSkillName(value)
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function splitSkillInput(skills) {
    if (Array.isArray(skills)) return skills;
    if (typeof skills === 'string') {
        return skills
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

async function resolveExistingSkills(normalizedInputs, db) {
    if (normalizedInputs.length === 0) return [];
    return db.skill.findMany({
        where: {
            OR: normalizedInputs.map((name) => ({
                name: { equals: name, mode: 'insensitive' },
            })),
        },
        select: { id: true, name: true },
    });
}

async function createMissingSkill(rawName, db) {
    const displayName = toCanonicalDisplayName(rawName);
    try {
        return await db.skill.create({
            data: { name: displayName },
            select: { id: true, name: true },
        });
    } catch (error) {
        if (error?.code !== 'P2002') throw error;
        return db.skill.findFirst({
            where: { name: { equals: displayName, mode: 'insensitive' } },
            select: { id: true, name: true },
        });
    }
}

async function normalizeSkillList(skills, options = {}) {
    const {
        createMissing = true,
        incrementUsage = false,
        db = prisma,
    } = options;

    const rawList = splitSkillInput(skills);
    const normalizedInputs = Array.from(
        new Set(
            rawList
                .map((item) => normalizeSkillName(item))
                .filter(Boolean)
                .map((item) => item.toLowerCase())
        )
    );

    if (normalizedInputs.length === 0) return [];

    const existingSkills = await resolveExistingSkills(normalizedInputs, db);
    const existingByLower = new Map(
        existingSkills.map((skill) => [skill.name.toLowerCase(), skill])
    );

    const createdSkills = [];
    if (createMissing) {
        for (const lowerName of normalizedInputs) {
            if (existingByLower.has(lowerName)) continue;
            const created = await createMissingSkill(lowerName, db);
            if (created) {
                existingByLower.set(created.name.toLowerCase(), created);
                createdSkills.push(created);
            }
        }
    }

    const canonicalSkills = normalizedInputs
        .map((lowerName) => existingByLower.get(lowerName)?.name)
        .filter(Boolean);

    if (incrementUsage && canonicalSkills.length > 0) {
        await Promise.all(
            canonicalSkills.map((name) =>
                db.skill.update({
                    where: { name },
                    data: { usageCount: { increment: 1 } },
                })
            )
        );
    }

    return canonicalSkills;
}

async function expandSkillQueryToCanonicalSkills(query, options = {}) {
    const { db = prisma, limitPerToken = 8 } = options;
    const tokens = splitSkillInput(query)
        .map((token) => normalizeSkillName(token))
        .filter(Boolean);

    if (tokens.length === 0) return [];

    const tokenMatches = await Promise.all(
        tokens.map((token) =>
            db.skill.findMany({
                where: {
                    name: { contains: token, mode: 'insensitive' },
                },
                orderBy: { usageCount: 'desc' },
                take: limitPerToken,
                select: { name: true },
            })
        )
    );

    const names = new Set();
    tokenMatches.forEach((matches) => {
        matches.forEach((skill) => names.add(skill.name));
    });

    return Array.from(names);
}

module.exports = {
    normalizeSkillName,
    toCanonicalDisplayName,
    normalizeSkillList,
    expandSkillQueryToCanonicalSkills,
};
