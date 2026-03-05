const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../config/logger');

let transporter = null;

/**
 * Lazy-initialise the SMTP transporter.
 * Returns null when SMTP is not configured (dev / MVP).
 */
function getTransporter() {
    if (transporter) return transporter;
    if (!config.smtp.host || !config.smtp.user) {
        logger.warn('SMTP not configured — emails will be logged only');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    return transporter;
}

/**
 * Send a password-reset OTP email.
 * Falls back to logger.info when SMTP is not configured.
 */
async function sendPasswordResetEmail(to, otp) {
    const subject = 'Recruit — Password Reset Code';
    const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#4F46E5">Password Reset</h2>
            <p>Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
            <div style="font-size:32px;letter-spacing:6px;font-weight:700;text-align:center;
                        background:#F3F4F6;border-radius:12px;padding:16px;margin:24px 0">
                ${otp}
            </div>
            <p style="color:#6B7280;font-size:13px">If you did not request this, you can safely ignore this email.</p>
        </div>
    `;

    const mailer = getTransporter();
    if (!mailer) {
        logger.info(`[DEV] Password-reset OTP for ${to}: ${otp}`);
        return;
    }

    try {
        await mailer.sendMail({ from: config.smtp.from, to, subject, html });
        logger.info(`Password-reset email sent to ${to}`);
    } catch (err) {
        logger.error(`Failed to send reset email to ${to}: ${err.message}`);
        // Don't throw — we still want the API to return success to prevent enumeration
    }
}

module.exports = { sendPasswordResetEmail };
