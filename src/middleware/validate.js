const ApiError = require('../utils/ApiError');

/**
 * Joi validation middleware factory.
 * Usage: validate(schema, 'body') or validate(schema, 'query')
 */
const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map((d) => ({
                field: d.path.join('.'),
                message: d.message.replace(/"/g, ''),
            }));
            const errorMessage = errors.map((e) => e.message).join(', ');
            throw ApiError.badRequest(errorMessage, errors);
        }

        // Replace with validated/sanitized values
        req[property] = value;
        next();
    };
};

module.exports = validate;
