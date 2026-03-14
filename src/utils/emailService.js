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

/**
 * Send team invite email containing secure accept link.
 */
async function sendTeamInviteEmail({
    to,
    inviterName,
    companyName,
    role,
    acceptUrl,
}) {
    const subject = `Recruit - Team Invite from ${companyName || 'a company'}`;
    const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;line-height:1.5">
            <h2 style="color:#0F766E;margin-bottom:8px">You are invited to join a recruiter team</h2>
            <p style="margin:0 0 12px 0"><strong>${inviterName || 'A recruiter'}</strong> invited you to collaborate in <strong>${companyName || 'their company'}</strong>.</p>
            <p style="margin:0 0 16px 0">Role: <strong>${role}</strong></p>

            <a href="${acceptUrl}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">
                Accept Collaboration Invite
            </a>

            <p style="margin:18px 0 8px 0;color:#6B7280;font-size:13px">If the button does not work, copy this link:</p>
            <p style="word-break:break-all;color:#374151;font-size:13px">${acceptUrl}</p>
            <p style="color:#6B7280;font-size:12px">If you did not expect this invite, you can ignore this email.</p>
        </div>
    `;

    const mailer = getTransporter();
    if (!mailer) {
        logger.info(`[DEV] Team invite for ${to}: ${acceptUrl}`);
        return;
    }

    try {
        await mailer.sendMail({
            from: config.smtp.from,
            to,
            subject,
            html,
        });
        logger.info(`Team invite email sent to ${to}`);
    } catch (err) {
        logger.error(`Failed to send team invite email to ${to}: ${err.message}`);
    }
}

module.exports = { sendPasswordResetEmail, sendTeamInviteEmail };
