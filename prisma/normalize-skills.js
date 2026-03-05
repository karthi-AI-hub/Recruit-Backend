const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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

function canonicalizeList(skills, map) {
  const result = [];
  const seen = new Set();
  (skills || []).forEach((skill) => {
    const normalized = normalizeSkillName(skill);
    if (!normalized) return;
    const canonical = map.get(normalized.toLowerCase()) || toCanonicalDisplayName(normalized);
    const key = canonical.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(canonical);
    }
  });
  return result;
}

async function main() {
  const skills = await prisma.skill.findMany({
    select: { id: true, name: true, usageCount: true, category: true },
  });

  const groups = new Map();
  skills.forEach((skill) => {
    const key = normalizeSkillName(skill.name).toLowerCase();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(skill);
  });

  const lowerToCanonical = new Map();

  for (const [lowerName, group] of groups.entries()) {
    const canonicalName = toCanonicalDisplayName(group[0].name);
    let target = group.find((s) => s.name === canonicalName) || null;

    if (!target) {
      target = await prisma.skill.create({
        data: {
          name: canonicalName,
          usageCount: 0,
          category: group.find((s) => s.category)?.category || null,
        },
      });
    }

    lowerToCanonical.set(lowerName, target.name);

    const duplicateIds = group.filter((s) => s.id !== target.id).map((s) => s.id);
    if (duplicateIds.length > 0) {
      await prisma.skill.deleteMany({ where: { id: { in: duplicateIds } } });
    }
  }

  const users = await prisma.user.findMany({ select: { id: true, skills: true } });
  for (const user of users) {
    const canonical = canonicalizeList(user.skills, lowerToCanonical);
    const same = JSON.stringify(canonical) === JSON.stringify(user.skills || []);
    if (!same) {
      await prisma.user.update({ where: { id: user.id }, data: { skills: canonical } });
    }
  }

  const jobs = await prisma.job.findMany({ select: { id: true, skills: true } });
  for (const job of jobs) {
    const canonical = canonicalizeList(job.skills, lowerToCanonical);
    const same = JSON.stringify(canonical) === JSON.stringify(job.skills || []);
    if (!same) {
      await prisma.job.update({ where: { id: job.id }, data: { skills: canonical } });
    }
  }

  const usageCounts = new Map();
  const updatedUsers = await prisma.user.findMany({ select: { skills: true } });
  const updatedJobs = await prisma.job.findMany({ select: { skills: true } });

  updatedUsers.forEach((user) => {
    (user.skills || []).forEach((skill) => {
      usageCounts.set(skill, (usageCounts.get(skill) || 0) + 1);
    });
  });

  updatedJobs.forEach((job) => {
    (job.skills || []).forEach((skill) => {
      usageCounts.set(skill, (usageCounts.get(skill) || 0) + 1);
    });
  });

  for (const [name] of usageCounts.entries()) {
    const existing = await prisma.skill.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (!existing) {
      await prisma.skill.create({ data: { name, usageCount: 0 } });
    }
  }

  const allSkills = await prisma.skill.findMany({ select: { id: true, name: true } });
  for (const skill of allSkills) {
    await prisma.skill.update({
      where: { id: skill.id },
      data: { usageCount: usageCounts.get(skill.name) || 0 },
    });
  }

  console.log('Skill normalization completed.');
}

main()
  .catch((error) => {
    console.error('Skill normalization failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
