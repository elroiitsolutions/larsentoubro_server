import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { LNT_LOGO_BASE64 } from '../assets/logoBase64.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const corporateLogoFilePath = path.join(__dirname, '../assets/corporate-logo.png');
const appAssetLogoPath = path.resolve(__dirname, '../../../larsentoubro-app/assets/images/email template logo/L&T Construction Corporate Logo.png');
const fallbackLogoPath = path.join(__dirname, '../assets/logo.png');

let cachedLogoBuffer = null;
const getLogoBuffer = () => {
    if (cachedLogoBuffer) return cachedLogoBuffer;

    // 1. Primary: Copied corporate logo in server assets
    if (fs.existsSync(corporateLogoFilePath)) {
        try {
            cachedLogoBuffer = fs.readFileSync(corporateLogoFilePath);
            return cachedLogoBuffer;
        } catch (e) {
            console.error('[MailService] Failed to read corporate-logo.png:', e.message);
        }
    }

    // 2. Secondary: Direct app email template logo
    if (fs.existsSync(appAssetLogoPath)) {
        try {
            cachedLogoBuffer = fs.readFileSync(appAssetLogoPath);
            return cachedLogoBuffer;
        } catch (e) {
            console.error('[MailService] Failed to read app corporate logo:', e.message);
        }
    }

    // 3. Fallback: Standard logo.png
    if (fs.existsSync(fallbackLogoPath)) {
        try {
            cachedLogoBuffer = fs.readFileSync(fallbackLogoPath);
            return cachedLogoBuffer;
        } catch (e) {
            console.error('[MailService] Failed to read fallback logo.png:', e.message);
        }
    }

    // 4. Fallback: Base64
    if (LNT_LOGO_BASE64) {
        try {
            const cleanBase64 = LNT_LOGO_BASE64.replace(/^data:image\/\w+;base64,/, '');
            cachedLogoBuffer = Buffer.from(cleanBase64, 'base64');
            return cachedLogoBuffer;
        } catch (e) {
            console.error('[MailService] Failed to parse base64 logo:', e.message);
        }
    }

    return null;
};

let transporter = null;

const getTransporter = () => {
    if (transporter) return transporter;

    if (env.SMTP_HOST && env.SMTP_USER) {
        transporter = nodemailer.createTransport({
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        console.log(`[MailService] Initialized pooled SMTP transporter (${env.SMTP_HOST}:${env.SMTP_PORT})`);
    }

    return transporter;
};

/**
 * Sends a 6-digit OTP email to the user for authentication with premium branding & embedded logo.
 * If SMTP credentials are not configured, it logs the OTP in the console for local development.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit numeric OTP code
 * @param {string} [recipientName='L&T Team Member'] - Recipient's display name
 * @returns {Promise<{ sent: boolean, devMode: boolean, messageId?: string }>}
 */
export const sendOtpEmail = async (toEmail, otp, recipientName = 'L&T Team Member') => {
    const mailClient = getTransporter();
    const logoBuffer = getLogoBuffer();

    const subject = `${otp} is your L&T Equipment Portal login code`;

    const attachments = [];
    if (logoBuffer) {
        attachments.push({
            filename: 'lnt-logo.png',
            content: logoBuffer,
            cid: 'lntlogo'
        });
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>L&T Verification Code</title>
        <!--[if mso]>
        <noscript>
            <xml>
                <o:OfficeDocumentSettings>
                    <o:PixelsPerInch>96</o:PixelsPerInch>
                </o:OfficeDocumentSettings>
            </xml>
        </noscript>
        <![endif]-->
        <style>
            body { margin: 0; padding: 0; background-color: #f1f5f9; -webkit-font-smoothing: antialiased; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
            table { border-collapse: separate; }
            a { color: #0284c7; text-decoration: none; }
            @media only screen and (max-width: 620px) {
                .email-container { width: 100% !important; border-radius: 0 !important; }
                .email-header { padding: 24px 16px !important; }
                .email-body { padding: 28px 20px !important; }
                .otp-number { font-size: 34px !important; letter-spacing: 8px !important; }
            }
        </style>
    </head>
    <body style="margin: 0; padding: 30px 10px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <center>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; margin: 0 auto;">
                <tr>
                    <td>
                        <!-- MAIN CONTAINER CARD -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
                            
                            <!-- HEADER (White Background with Official Corporate Logo) -->
                            <tr>
                                <td align="center" class="email-header" style="background-color: #ffffff; padding: 34px 28px 24px 28px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                                    
                                    <!-- CORPORATE LOGO -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                                        <tr>
                                            <td align="center">
                                                <img src="cid:lntlogo" alt="L&T Construction" width="240" style="display: block; margin: 0 auto; max-width: 240px; width: 100%; height: auto; border: 0; outline: none;" />
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- SUBTITLE -->
                                    <div style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 1.8px; text-transform: uppercase; margin-top: 14px;">
                                        Tools &amp; Equipment Management Portal
                                    </div>
                                </td>
                            </tr>

                            <!-- BODY CONTENT -->
                            <tr>
                                <td class="email-body" style="padding: 36px 32px 28px 32px; background-color: #ffffff; color: #1e293b; text-align: left;">
                                    
                                    <div style="font-size: 17px; font-weight: 700; color: #0f2942; margin-bottom: 8px;">
                                        Hello ${recipientName},
                                    </div>

                                    <div style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
                                        You requested a single-use verification code to securely access the <strong>L&amp;T Equipment Portal</strong>. Please use the 6-digit code below to complete your authentication:
                                    </div>

                                    <!-- HERO OTP BOX -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0 24px 0;">
                                        <tr>
                                            <td align="center" style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border: 2px solid #cbd5e1; border-radius: 14px; padding: 22px 16px; text-align: center;">
                                                <div style="font-size: 10px; font-weight: 800; color: #64748b; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px;">
                                                    Verification Code
                                                </div>
                                                <div class="otp-number" style="font-family: 'SF Pro Display', Consolas, 'Courier New', Courier, monospace; font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #0f2942; margin: 4px 0; text-indent: 12px;">
                                                    ${otp}
                                                </div>
                                                <div style="margin-top: 10px;">
                                                    <span style="display: inline-block; background-color: #e0f2fe; border: 1px solid #bae6fd; border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; color: #0284c7; letter-spacing: 0.3px;">
                                                        &#9201; Valid for 10 minutes &bull; Single-use only
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- SECURITY ADVISORY NOTICE -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0;">
                                        <tr>
                                            <td style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 16px; text-align: left;">
                                                <div style="font-size: 12px; font-weight: 700; color: #92400e; margin-bottom: 3px;">
                                                    &#128274; Security Advisory
                                                </div>
                                                <div style="font-size: 12px; line-height: 1.5; color: #78350f;">
                                                    Never share this verification code with anyone, including L&amp;T administrators or IT personnel. If you did not initiate this sign-in request, please contact your portal administrator immediately.
                                                </div>
                                            </td>
                                        </tr>
                                    </table>

                                </td>
                            </tr>

                            <!-- FOOTER -->
                            <tr>
                                <td style="background-color: #f8fafc; padding: 22px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.6; color: #94a3b8;">
                                    <div style="font-weight: 700; color: #64748b; margin-bottom: 2px;">
                                        Larsen &amp; Toubro Limited &bull; Construction &amp; Equipment Division
                                    </div>
                                    <div>
                                        Automated system transmission sent to <span style="color: #475569; font-weight: 600;">${toEmail}</span>.<br />
                                        &copy; ${new Date().getFullYear()} Larsen &amp; Toubro Limited. All rights reserved.
                                    </div>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </center>
    </body>
    </html>
    `;

    const textContent = `LARSEN & TOUBRO - Tools & Equipment Portal

Hello ${recipientName},

Your single-use login verification code is: ${otp}

This code is valid for 10 minutes and can only be used once.

Security Notice: Never share this OTP with anyone. If you did not initiate this login request, please contact your L&T administrator immediately.

(c) ${new Date().getFullYear()} Larsen & Toubro Limited.`;

    // If SMTP is configured, attempt sending email
    if (mailClient) {
        try {
            const info = await mailClient.sendMail({
                from: env.SMTP_FROM || '"L&T Equipment Portal" <no-reply@larsentoubro.com>',
                to: toEmail,
                replyTo: 'no-reply@larsentoubro.com',
                subject,
                text: textContent,
                html: htmlContent,
                attachments
            });
            console.log(`[MailService] OTP email successfully dispatched to ${toEmail}. Message ID: ${info.messageId}`);
            return { sent: true, devMode: false, messageId: info.messageId };
        } catch (error) {
            console.error(`[MailService] Failed to send email via SMTP to ${toEmail}:`, error.message);
            // Fall back to console logger
        }
    }

    // Development / Fallback Console Logger
    console.log(`\n=============================================================`);
    console.log(`[L&T AUTH DEV MODE] EMAIL OTP GENERATED FOR: ${toEmail}`);
    console.log(`RECIPIENT NAME: ${recipientName}`);
    console.log(`VERIFICATION CODE: [ ${otp} ]`);
    console.log(`VALIDITY: 10 MINUTES`);
    console.log(`=============================================================\n`);

    return { sent: true, devMode: true };
};

export default {
    sendOtpEmail
};
