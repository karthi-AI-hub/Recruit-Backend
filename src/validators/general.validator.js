const Joi = require('joi');

const createApplication = Joi.object({
    jobId: Joi.string().uuid().required(),
    coverLetter: Joi.string().trim().allow('', null),
});

const updateApplicationStatus = Joi.object({
    status: Joi.string()
        .valid('applied', 'in_review', 'shortlisted', 'interviewed', 'offered', 'rejected', 'withdrawn', 'hired')
        .required(),
    recruiterMessage: Joi.string().trim().allow('', null),
});

const updateProfile = Joi.object({
    name: Joi.string().trim().min(2).max(100),
    phone: Joi.string().trim().allow('', null),
    headline: Joi.string().trim().max(200).allow('', null),
    location: Joi.string().trim().allow('', null),
    experience: Joi.number().integer().min(0),
    skills: Joi.array().items(Joi.string().trim()),
    currentCompany: Joi.string().trim().allow('', null),
    currentDesignation: Joi.string().trim().allow('', null),
    expectedSalary: Joi.number().min(0).allow(null),
    isAvailable: Joi.boolean(),
    noticePeriod: Joi.string().trim().allow('', null),
    currentCtc: Joi.string().trim().allow('', null),
    isProfileHidden: Joi.boolean(),
}).min(1);

const createTemplate = Joi.object({
    title: Joi.string().trim().min(2).max(200).required(),
    body: Joi.string().trim().min(5).required(),
    placeholders: Joi.array().items(Joi.string().trim()).default([]),
    category: Joi.string().trim().allow('', null),
    isDefault: Joi.boolean().default(false),
});

const updateTemplate = Joi.object({
    title: Joi.string().trim().min(2).max(200),
    body: Joi.string().trim().min(5),
    placeholders: Joi.array().items(Joi.string().trim()),
    category: Joi.string().trim().allow('', null),
    isDefault: Joi.boolean(),
}).min(1);

const sendMessage = Joi.object({
    toUserId: Joi.string().uuid().required(),
    subject: Joi.string().trim().required(),
    body: Joi.string().trim().required(),
    templateId: Joi.string().uuid().allow(null),
});

const sendBulkMessages = Joi.object({
    toUserIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    subject: Joi.string().trim().required(),
    body: Joi.string().trim().required(),
    templateId: Joi.string().uuid().allow(null),
    placeholders: Joi.object().pattern(Joi.string(), Joi.string()).allow(null),
});

module.exports = {
    createApplication,
    updateApplicationStatus,
    updateProfile,
    createTemplate,
    updateTemplate,
    sendMessage,
    sendBulkMessages,
};