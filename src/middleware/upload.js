const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// Ensure upload directory exists
const uploadDir = path.resolve(config.upload.dir);
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subDir = 'misc';
        if (file.fieldname === 'resume') subDir = 'resumes';
        else if (file.fieldname === 'profileImage') subDir = 'profiles';
        else if (file.fieldname === 'companyLogo') subDir = 'logos';

        const dir = path.join(uploadDir, subDir);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safeEmail = req.user?.email
            ? String(req.user.email)
                .trim()
                .toLowerCase()
                .replace('@', '_at_')
                .replace(/[^a-z0-9._-]/g, '_')
            : null;

        if (safeEmail) {
            return cb(null, `${safeEmail}_${file.fieldname}${ext}`);
        }

        cb(null, `${file.fieldname}${ext}`);
    },
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = {
        resume: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        profileImage: ['image/jpeg', 'image/png', 'image/webp'],
        companyLogo: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    };

    const allowed = allowedMimeTypes[file.fieldname] || Object.values(allowedMimeTypes).flat();

    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(ApiError.badRequest(`Invalid file type for ${file.fieldname}. Allowed: ${allowed.join(', ')}`));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: config.upload.maxFileSize,
    },
});

module.exports = upload;
