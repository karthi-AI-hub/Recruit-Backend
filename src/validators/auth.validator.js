const Joi = require('joi');

const register = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().min(6).max(128).required(),
    phone: Joi.string().trim().required(),
    role: Joi.string().valid('job_seeker', 'recruiter').required(),
});

const login = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().required(),
});

const refreshToken = Joi.object({
    refreshToken: Joi.string().required(),
});

module.exports = { register, login, refreshToken };
