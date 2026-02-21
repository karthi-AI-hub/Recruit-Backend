const Joi = require('joi');

const createJob = Joi.object({
    title: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().min(10).required(),
    location: Joi.string().trim().required(),
    salaryMin: Joi.number().min(0).allow(null),
    salaryMax: Joi.number().min(0).allow(null),
    minExperience: Joi.number().integer().min(0).default(0),
    maxExperience: Joi.number().integer().min(0).default(0),
    skills: Joi.array().items(Joi.string().trim()).default([]),
    requirements: Joi.array().items(Joi.string().trim()).default([]),
    jobType: Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'freelance').default('full_time'),
    employmentType: Joi.string().trim().allow('', null),
    isRemote: Joi.boolean().default(false),
    isHotJob: Joi.boolean().default(false),
    companyName: Joi.string().trim().required(),
    companyLogo: Joi.string().trim().allow('', null),
    companyDescription: Joi.string().trim().allow('', null),
    expiresAt: Joi.date().iso().allow(null),
});

const updateJob = Joi.object({
    title: Joi.string().trim().min(3).max(200),
    description: Joi.string().trim().min(10),
    location: Joi.string().trim(),
    salaryMin: Joi.number().min(0).allow(null),
    salaryMax: Joi.number().min(0).allow(null),
    minExperience: Joi.number().integer().min(0),
    maxExperience: Joi.number().integer().min(0),
    skills: Joi.array().items(Joi.string().trim()),
    requirements: Joi.array().items(Joi.string().trim()),
    jobType: Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'freelance'),
    employmentType: Joi.string().trim().allow('', null),
    isRemote: Joi.boolean(),
    isHotJob: Joi.boolean(),
    status: Joi.string().valid('active', 'closed', 'draft'),
    expiresAt: Joi.date().iso().allow(null),
}).min(1);

const jobFilters = Joi.object({
    location: Joi.string().trim(),
    jobType: Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'freelance'),
    isRemote: Joi.boolean(),
    minExperience: Joi.number().integer().min(0),
    maxExperience: Joi.number().integer().min(0),
    search: Joi.string().trim(),
    status: Joi.string().valid('active', 'closed', 'draft'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('postedDate', 'salary', 'applicants').default('postedDate'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

module.exports = { createJob, updateJob, jobFilters };
