const ApiError = require('../utils/ApiError');

/**
 * Global error handler middleware.
 * Express identifies this as an error handler because it has 4 parameters.
 */
const errorHandler = (err, req, res, _next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errors = err.errors || [];

    // Prisma known error codes
    if (err.code === 'P2002') {
        statusCode = 409;
        message = 'A record with this value already exists';
        const target = err.meta?.target;
        if (target) {
            message = `Duplicate value for: ${Array.isArray(target) ? target.join(', ') : target}`;
        }
    }

    if (err.code === 'P2025') {
        statusCode = 404;
        message = 'Record not found';
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
    }

    // Joi validation errors
    if (err.isJoi) {
        statusCode = 400;
        message = 'Validation error';
        errors = err.details.map((d) => ({
            field: d.path.join('.'),
            message: d.message,
        }));
    }

    // TypeError (e.g. "Cannot destructure property of undefined")
    // These typically happen when req.body is missing or malformed
    if (err instanceof TypeError && statusCode === 500) {
        statusCode = 400;
        message = 'Bad request: ' + err.message;
    }

    // JSON SyntaxError from malformed request body
    if (err instanceof SyntaxError && err.status === 400) {
        statusCode = 400;
        message = 'Invalid JSON in request body';
    }


    // Log in development
    if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error:', {
            statusCode,
            message,
            errors,
            stack: err.stack,
        });
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(errors.length > 0 && { errors }),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

module.exports = errorHandler;
