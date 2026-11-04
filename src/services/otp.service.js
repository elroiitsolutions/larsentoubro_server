import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Otp } from '../models/otp.model.js';
import { User } from '../models/user.model.js';
import { Vendor } from '../models/vendor.model.js';
import { GuestUser } from '../models/guestUser.model.js';
import '../models/project.model.js';
import '../models/store.model.js';
import { LoginLog } from '../models/loginLog.model.js';
import { sendOtpEmail } from './mail.service.js';
import { sendGuestSmsOtp, normalizeIndianPhoneNumber } from './sms.service.js';
import { parseUserAgent } from '../utils/deviceInfo.js';

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/**
 * Generate user JWT token
 */
const generateUserToken = (user) => {
    return jwt.sign(
        {
            id: user._id || user.id,
            email: user.email || user.contactEmail,
            role: user.role || 'User',
            name: user.name,
            phone: user.phone || null,
            allowedPages: user.allowedPages || [],
            isVendor: user.isVendor || false,
            projects: user.projects || [],
            stores: user.stores || []
        },
        env.JWT_SECRET,
        { expiresIn: '1d' }
    );
};

/**
 * Finds user in either User collection or Vendor collection.
 */
export const findAccountByEmail = async (email, { populate = true } = {}) => {
    const normalized = (email || '').trim().toLowerCase();

    // 1. Search in User collection
    let userQuery = User.findOne({ email: normalized });
    if (populate) {
        userQuery = userQuery
            .populate('projects', 'name projectCode location code')
            .populate('stores', 'name storeCode location');
    }
    const user = await userQuery;

    if (user) {
        return { account: user, type: 'user' };
    }

    // 2. Search in Vendor collection
    let vendorQuery = Vendor.findOne({
        $or: [
            { contactEmail: normalized },
            { email: normalized }
        ]
    });
    if (populate) {
        vendorQuery = vendorQuery
            .populate('projects', 'name code location')
            .populate('stores', 'name code siteName');
    }
    const vendor = await vendorQuery;

    if (vendor) {
        return { account: vendor, type: 'vendor' };
    }

    return null;
};

/**
 * Requests an OTP for a given email address.
 * Enforces user existence, account active status, resend cooldown, and single-use invalidation.
 */
export const requestOtp = async (email, reqMeta = {}) => {
    const normalizedEmail = (email || '').trim().toLowerCase();

    const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/i;
    if (!normalizedEmail || !strictEmailRegex.test(normalizedEmail)) {
        const error = new Error("Email address must contain '@' and '.' (e.g. name@domain.com).");
        error.status = 400;
        throw error;
    }

    // Check if account exists (lightweight query without heavy population)
    const accountInfo = await findAccountByEmail(normalizedEmail, { populate: false });
    if (!accountInfo) {
        // Record failed attempt in LoginLog
        await LoginLog.create({
            userName: normalizedEmail,
            userEmail: normalizedEmail,
            role: 'Unknown',
            status: 'Failed',
            rejectionReason: 'Account not found for email OTP request',
            ipAddress: reqMeta.ip || '',
            userAgent: reqMeta.userAgent || '',
            deviceInfo: parseUserAgent(reqMeta.userAgent || '')
        });

        const error = new Error('No account found registered with this email address. Please contact your administrator.');
        error.status = 404;
        throw error;
    }

    const { account, type } = accountInfo;

    // Check if account is inactive
    if (account.status === 'Inactive' || account.status === 'Suspended') {
        await LoginLog.create({
            user: account._id,
            userName: account.name,
            userEmail: normalizedEmail,
            role: account.role || (type === 'vendor' ? 'Vendor' : 'User'),
            status: 'Failed',
            rejectionReason: 'Account is inactive',
            ipAddress: reqMeta.ip || '',
            userAgent: reqMeta.userAgent || '',
            deviceInfo: parseUserAgent(reqMeta.userAgent || '')
        });

        const error = new Error('Your account is currently inactive. Please contact the administrator.');
        error.status = 403;
        throw error;
    }

    // Check cooldown from last sent OTP
    const existingOtp = await Otp.findOne({
        email: normalizedEmail,
        isUsed: false
    }).sort({ createdAt: -1 });

    if (existingOtp && existingOtp.lastSentAt) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(existingOtp.lastSentAt).getTime()) / 1000);
        if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
            const waitSeconds = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
            const error = new Error(`Please wait ${waitSeconds} second(s) before requesting a new code.`);
            error.status = 429;
            error.retryAfter = waitSeconds;
            throw error;
        }
    }

    // Invalidate any previous unverified OTPs for this email
    await Otp.updateMany(
        { email: normalizedEmail, isUsed: false },
        { $set: { isUsed: true } }
    );

    // Generate secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Persist OTP record
    await Otp.create({
        email: normalizedEmail,
        otp,
        expiresAt,
        attempts: 0,
        maxAttempts: MAX_ATTEMPTS,
        lastSentAt: new Date(),
        isUsed: false,
        ipAddress: reqMeta.ip || '',
        userAgent: reqMeta.userAgent || ''
    });

    // Send email via mailer service asynchronously in background (Non-blocking for instant sub-50ms UI response)
    sendOtpEmail(normalizedEmail, otp, account.name || 'Team Member').catch((err) => {
        console.error(`[OtpService] Background SMTP dispatch error for ${normalizedEmail}:`, err.message);
    });

    return {
        success: true,
        message: `A 6-digit verification code has been sent to ${normalizedEmail}`,
        email: normalizedEmail,
        resendCooldown: RESEND_COOLDOWN_SECONDS,
        expiresIn: OTP_EXPIRY_MINUTES * 60,
        // In local development / fallback mode, provide preview for easy testing
        devOtp: env.NODE_ENV === 'development' ? otp : undefined
    };
};

/**
 * Verifies an OTP code and authenticates the user, issuing a JWT and user session.
 */
export const verifyOtp = async (email, otpCode, reqMeta = {}) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const cleanOtp = String(otpCode || '').trim();

    if (!normalizedEmail || !cleanOtp) {
        const error = new Error('Email and 6-digit verification code are required.');
        error.status = 400;
        throw error;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
        const error = new Error('Verification code must be exactly 6 digits.');
        error.status = 400;
        throw error;
    }

    // Find the latest active OTP for this email
    const otpDoc = await Otp.findOne({
        email: normalizedEmail,
        isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
        const error = new Error('No active verification code found for this email. Please request a new code.');
        error.status = 400;
        throw error;
    }

    // Check expiry
    if (Date.now() > new Date(otpDoc.expiresAt).getTime()) {
        otpDoc.isUsed = true;
        await otpDoc.save();

        const error = new Error('The verification code has expired. Please request a new code.');
        error.status = 400;
        throw error;
    }

    // Check attempt limits
    if (otpDoc.attempts >= otpDoc.maxAttempts) {
        otpDoc.isUsed = true;
        await otpDoc.save();

        const error = new Error('Too many invalid attempts. This code is now invalid. Please request a new code.');
        error.status = 429;
        throw error;
    }

    // Compare code
    if (otpDoc.otp !== cleanOtp) {
        otpDoc.attempts += 1;
        const remaining = otpDoc.maxAttempts - otpDoc.attempts;

        if (remaining <= 0) {
            otpDoc.isUsed = true;
        }
        await otpDoc.save();

        // Record failed login log
        try {
            await LoginLog.create({
                userEmail: normalizedEmail,
                role: 'Unknown',
                status: 'Failed',
                rejectionReason: `Invalid OTP attempt (${otpDoc.attempts}/${otpDoc.maxAttempts})`,
                ipAddress: reqMeta.ip || '',
                userAgent: reqMeta.userAgent || '',
                deviceInfo: parseUserAgent(reqMeta.userAgent || '')
            });
        } catch (logErr) {
            console.error('[OTP Log Error]:', logErr.message);
        }

        if (remaining <= 0) {
            const error = new Error('Too many failed attempts. This code is now invalid. Please request a new code.');
            error.status = 429;
            throw error;
        }

        const error = new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
        error.status = 400;
        throw error;
    }

    // Successfully verified! Mark OTP as used immediately (single-use guarantee)
    otpDoc.isUsed = true;
    await otpDoc.save();

    // Invalidate any other OTPs for this email as hygiene
    await Otp.updateMany(
        { email: normalizedEmail, isUsed: false },
        { $set: { isUsed: true } }
    );

    // Fetch user details for session token
    const accountInfo = await findAccountByEmail(normalizedEmail);
    if (!accountInfo) {
        const error = new Error('Account associated with this email no longer exists.');
        error.status = 404;
        throw error;
    }

    const { account, type } = accountInfo;

    // Issue JWT
    const token = generateUserToken(account);

    // Build user session object preserving roles and permissions
    let userObj = {};
    if (type === 'vendor') {
        userObj = {
            _id: account._id,
            id: account._id.toString(),
            name: account.name,
            email: account.contactEmail || account.email,
            phonenumber: account.contactPhone || '',
            role: 'Vendor',
            isVendor: true,
            vendorCode: account.vendorCode,
            contactPerson: account.contactPerson,
            gstNumber: account.gstNumber,
            allowedPages: account.allowedPages || ['/projects', '/stores', '/tools'],
            projects: account.projects || [],
            stores: account.stores || []
        };
    } else {
        const raw = account.toObject();
        delete raw.password;
        userObj = {
            ...raw,
            id: account._id.toString(),
            allowedPages: account.allowedPages || ['/dashboard', '/projects', '/stores'],
            canCreateUser: Boolean(account.role === 'Admin' || account.canCreateUser),
            hasInspectionAccess: Boolean(account.role === 'Admin' || account.hasInspectionAccess),
            projects: account.projects || [],
            stores: account.stores || []
        };
    }

    // Record successful login in audit log and login log
    await LoginLog.create({
        user: account._id,
        userName: account.name,
        userEmail: normalizedEmail,
        role: account.role || (type === 'vendor' ? 'Vendor' : 'User'),
        parentUser: account.parentUser || null,
        status: 'Success',
        ipAddress: reqMeta.ip || '',
        userAgent: reqMeta.userAgent || '',
        deviceInfo: parseUserAgent(reqMeta.userAgent || '')
    });

    return {
        success: true,
        message: 'Authentication successful',
        token,
        user: userObj
    };
};

/**
 * Requests an SMS OTP for Guest access verification using mobile number.
 * Enforces guest user registration, active status, and 15-day expiry.
 */
export const requestGuestPhoneOtp = async (rawPhone, reqMeta = {}) => {
    const { clean10, e164, isValid } = normalizeIndianPhoneNumber(rawPhone);
    if (!isValid) {
        const error = new Error('Please enter a valid 10-digit Indian mobile number.');
        error.status = 400;
        throw error;
    }

    // 1. Check if guest user exists in the registry
    const guestUser = await GuestUser.findOne({ phone: clean10 });
    if (!guestUser) {
        await LoginLog.create({
            userName: `Guest (${clean10})`,
            userPhone: clean10,
            role: 'Guest',
            status: 'Failed',
            userEmail: `guest-${clean10}@lnt.com`,
            rejectionReason: 'Guest account not registered',
            ipAddress: reqMeta.ip || '',
            userAgent: reqMeta.userAgent || '',
            deviceInfo: parseUserAgent(reqMeta.userAgent || '')
        });
        // const error = new Error('No registered guest account found for this mobile number. Please contact your administrator.');
        const error = new Error('We couldn\'t find a registered guest account associated with this mobile number. Please contact your administrator for assistance.');
        error.status = 404;
        throw error;
    }

    // 2. Check if account is disabled
    if (guestUser.status === 'Disabled') {
        await LoginLog.create({
            user: guestUser._id,
            userName: guestUser.name,
            userPhone: clean10,
            role: 'Guest',
            status: 'Failed',
            userEmail: guestUser.email || `guest-${clean10}@lnt.com`,
            rejectionReason: 'Guest account is disabled',
            ipAddress: reqMeta.ip || '',
            userAgent: reqMeta.userAgent || '',
            deviceInfo: parseUserAgent(reqMeta.userAgent || '')
        });
        const error = new Error('Your guest account has been disabled. Please contact your administrator.');
        error.status = 403;
        throw error;
    }

    // 3. Check if account is expired (automatic 15-day expiry rule)
    const now = new Date();
    const isExpired = guestUser.status === 'Expired' || now >= new Date(guestUser.expiresAt);
    if (isExpired) {
        if (guestUser.status !== 'Expired') {
            guestUser.status = 'Expired';
            guestUser.notificationStatus = 'Expired';
            await guestUser.save();
        }

        await LoginLog.create({
            user: guestUser._id,
            userName: guestUser.name,
            userPhone: clean10,
            role: 'Guest',
            status: 'Failed',
            userEmail: guestUser.email || `guest-${clean10}@lnt.com`,
            rejectionReason: 'Guest account has expired',
            ipAddress: reqMeta.ip || '',
            userAgent: reqMeta.userAgent || '',
            deviceInfo: parseUserAgent(reqMeta.userAgent || '')
        });

        const error = new Error('Your guest account has expired. Please contact your administrator to extend your access.');
        error.status = 403;
        throw error;
    }

    // 4. Check cooldown from last sent OTP for this phone
    const existingOtp = await Otp.findOne({
        phone: clean10,
        purpose: 'GUEST_ACCESS',
        isUsed: false
    }).sort({ createdAt: -1 });

    if (existingOtp && existingOtp.lastSentAt) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(existingOtp.lastSentAt).getTime()) / 1000);
        if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
            const waitSeconds = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
            const error = new Error(`Please wait ${waitSeconds} second(s) before requesting a new SMS code.`);
            error.status = 429;
            error.retryAfter = waitSeconds;
            throw error;
        }
    }

    // 5. Invalidate any previous unused OTPs for this phone
    await Otp.updateMany(
        { phone: clean10, purpose: 'GUEST_ACCESS', isUsed: false },
        { $set: { isUsed: true } }
    );

    // 6. Generate secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Persist OTP record
    await Otp.create({
        phone: clean10,
        purpose: 'GUEST_ACCESS',
        otp,
        expiresAt,
        attempts: 0,
        maxAttempts: MAX_ATTEMPTS,
        lastSentAt: new Date(),
        isUsed: false,
        ipAddress: reqMeta.ip || '',
        userAgent: reqMeta.userAgent || ''
    });

    // Send SMS via service asynchronously
    sendGuestSmsOtp(clean10, otp).catch((err) => {
        console.error(`[OtpService] SMS dispatch error for ${e164}:`, err.message);
    });

    return {
        success: true,
        message: `A 6-digit verification code has been sent via SMS to ${e164}`,
        phone: clean10,
        formattedPhone: e164,
        guestName: guestUser.name,
        resendCooldown: RESEND_COOLDOWN_SECONDS,
        expiresIn: OTP_EXPIRY_MINUTES * 60,
        devOtp: env.NODE_ENV === 'development' ? otp : undefined
    };
};

/**
 * Verifies the SMS OTP for Guest access and issues a scoped JWT.
 */
export const verifyGuestPhoneOtp = async (rawPhone, otpCode, reqMeta = {}) => {
    const { clean10, e164, isValid } = normalizeIndianPhoneNumber(rawPhone);
    const cleanOtp = String(otpCode || '').trim();

    if (!isValid || !cleanOtp) {
        const error = new Error('Valid mobile number and 6-digit verification code are required.');
        error.status = 400;
        throw error;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
        const error = new Error('Verification code must be exactly 6 digits.');
        error.status = 400;
        throw error;
    }

    // 1. Verify guest user registration and active status
    const guestUser = await GuestUser.findOne({ phone: clean10 });
    if (!guestUser) {
        // const error = new Error('No registered guest account found for this mobile number. Please contact your administrator.');
        const error = new Error('We couldn\'t find a registered guest account associated with this mobile number. Please contact your administrator for assistance.');
        error.status = 404;
        throw error;
    }

    const now = new Date();
    if (guestUser.status === 'Disabled') {
        const error = new Error('Your guest account has been disabled. Please contact your administrator.');
        error.status = 403;
        throw error;
    }

    if (guestUser.status === 'Expired' || now >= new Date(guestUser.expiresAt)) {
        if (guestUser.status !== 'Expired') {
            guestUser.status = 'Expired';
            guestUser.notificationStatus = 'Expired';
            await guestUser.save();
        }
        const error = new Error('Your guest account has expired. Please contact your administrator to extend your access.');
        error.status = 403;
        throw error;
    }

    // 2. Find active OTP record
    const otpRecord = await Otp.findOne({
        phone: clean10,
        purpose: 'GUEST_ACCESS',
        isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
        const error = new Error('No active verification code found for this mobile number. Please request a new code.');
        error.status = 404;
        throw error;
    }

    // Check expiry
    if (new Date() > new Date(otpRecord.expiresAt)) {
        await Otp.updateOne({ _id: otpRecord._id }, { $set: { isUsed: true } });
        const error = new Error('Verification code has expired. Please request a new code.');
        error.status = 410;
        throw error;
    }

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
        await Otp.updateOne({ _id: otpRecord._id }, { $set: { isUsed: true } 
        });
        const error = new Error('Too many failed attempts. Please request a new code.');
        error.status = 429;
        throw error;
    }

    // Check code match
    if (otpRecord.otp !== cleanOtp) {
        await Otp.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
        const remaining = otpRecord.maxAttempts - (otpRecord.attempts + 1);
        const error = new Error(
            remaining > 0
                ? `Invalid verification code. You have ${remaining} attempt(s) remaining.`
                : 'Invalid code. Maximum attempts reached. Please request a new code.'
        );
        error.status = 400;
        throw error;
    }

    // Mark OTP as used
    await Otp.updateOne({ _id: otpRecord._id }, { $set: { isUsed: true } });

    // Update guest user last login
    guestUser.lastLoginAt = now;
    await guestUser.save();

    // Generate Guest user payload with authenticated guest details
    const guestUserPayload = {
        _id: guestUser._id.toString(),
        id: guestUser._id.toString(),
        name: guestUser.name,
        email: guestUser.email || `guest-${clean10}@lnt.com`,
        phone: clean10,
        formattedPhone: guestUser.formattedPhone || e164,
        role: 'Guest',
        user_id: `GUEST-${clean10.slice(-4)}`,
        allowedPages: ['/qr-scanner'],
        expiresAt: guestUser.expiresAt
    };

    const token = generateUserToken(guestUserPayload);

    // Record login in LoginLog
    await LoginLog.create({
        user: guestUser._id,
        userName: guestUserPayload.name,
        userEmail: guestUserPayload.email,
        userPhone: clean10,
        role: 'Guest',
        status: 'Success',
        ipAddress: reqMeta.ip || '',
        userAgent: reqMeta.userAgent || '',
        deviceInfo: parseUserAgent(reqMeta.userAgent || '')
    });

    return {
        success: true,
        message: 'Guest verification successful',
        token,
        user: guestUserPayload
    };
};

export default {
    requestOtp,
    verifyOtp,
    requestGuestPhoneOtp,
    verifyGuestPhoneOtp,
    findAccountByEmail
};
