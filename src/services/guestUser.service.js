import mongoose from 'mongoose';
import { GuestUser } from '../models/guestUser.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { normalizeIndianPhoneNumber } from './sms.service.js';

// Duration mappings for extension
const DURATION_DAYS_MAP = {
    '15_days': 15,
    '15 days': 15,
    '15days': 15,
    '45_days': 45,
    '45 days': 45,
    '45days': 45,
    '1_month': 30,
    '1 month': 30,
    '1month': 30,
    '3_months': 90,
    '3 months': 90,
    '3months': 90,
    '6_months': 180,
    '6 months': 180,
    '6months': 180
};

const DURATION_LABELS_MAP = {
    '15_days': '15 days',
    '15 days': '15 days',
    '15days': '15 days',
    '45_days': '45 days',
    '45 days': '45 days',
    '45days': '45 days',
    '1_month': '1 month',
    '1 month': '1 month',
    '1month': '1 month',
    '3_months': '3 months',
    '3 months': '3 months',
    '3months': '3 months',
    '6_months': '6 months',
    '6 months': '6 months',
    '6months': '6 months'
};

/**
 * Safe audit logger for guest user actions
 */
const logAudit = async (actor, action, details = {}) => {
    try {
        const actorId = actor?._id || actor?.id;
        if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
            await AuditLog.create({
                actor: actorId,
                action,
                details
            });
        }
    } catch (err) {
        console.error(`[AuditLog] Failed to record audit log for ${action}:`, err.message);
    }
};

/**
 * Creates a new Guest User. Automatically sets 15-day initial expiry.
 */
export const createGuestUser = async (data, actor) => {
    const rawName = (data.name || '').trim();
    if (!rawName) {
        const error = new Error('Guest user name is required.');
        error.status = 400;
        throw error;
    }

    const { clean10, e164, isValid } = normalizeIndianPhoneNumber(data.phone);
    if (!isValid) {
        const error = new Error('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).');
        error.status = 400;
        throw error;
    }

    // Check if guest user already exists
    const existing = await GuestUser.findOne({ phone: clean10 });
    if (existing) {
        if (existing.status === 'Active' && new Date() < new Date(existing.expiresAt)) {
            const error = new Error(`An active guest account with mobile number ${clean10} already exists.`);
            error.status = 409;
            throw error;
        }
        // If expired or disabled, re-activate with fresh 15-day window
        existing.name = rawName;
        existing.formattedPhone = e164;
        existing.email = (data.email || '').trim().toLowerCase();
        existing.organization = (data.organization || '').trim();
        existing.purpose = (data.purpose || '').trim();
        existing.status = 'Active';
        existing.expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
        existing.notificationStatus = 'None';
        existing.notificationSentAt = null;
        existing.rejectionReason = '';
        existing.createdBy = {
            _id: actor._id || actor.id || null,
            name: actor.name || 'System User',
            email: actor.email || '',
            role: actor.role || 'User'
        };
        if (data.customFields) {
            existing.customFields = data.customFields;
        }
        await existing.save();

        await logAudit(actor, 'GUEST_USER_REACTIVATED', {
            guestId: existing._id,
            name: existing.name,
            phone: clean10,
            expiresAt: existing.expiresAt
        });

        return existing;
    }

    // New 15-day guest account
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const guestUser = new GuestUser({
        name: rawName,
        phone: clean10,
        formattedPhone: e164,
        email: (data.email || '').trim().toLowerCase(),
        organization: (data.organization || '').trim(),
        purpose: (data.purpose || '').trim(),
        status: 'Active',
        expiresAt,
        initialDurationDays: 15,
        totalDurationDays: 15,
        notificationStatus: 'None',
        createdBy: {
            _id: actor._id || actor.id || null,
            name: actor.name || 'System User',
            email: actor.email || '',
            role: actor.role || 'User'
        },
        customFields: data.customFields || {}
    });

    await guestUser.save();

    await logAudit(actor, 'GUEST_USER_CREATED', {
        guestId: guestUser._id,
        name: guestUser.name,
        phone: clean10,
        expiresAt
    });

    return guestUser;
};

/**
 * Retrieves all Guest Users with live expiry evaluation.
 */
export const getGuestUsers = async (query = {}, actor) => {
    // 1. Live self-healing auto-expiry evaluation
    const now = new Date();
    await GuestUser.updateMany(
        { status: 'Active', expiresAt: { $lte: now } },
        { $set: { status: 'Expired', notificationStatus: 'Expired' } }
    );

    // 2. Build filter
    const filter = {};
    if (query.search) {
        const regex = new RegExp(query.search.trim(), 'i');
        filter.$or = [
            { name: { $regex: regex } },
            { phone: { $regex: regex } },
            { organization: { $regex: regex } },
            { email: { $regex: regex } }
        ];
    }

    if (query.status && query.status !== 'All') {
        if (query.status === 'Expiring Soon') {
            // Expiring in next 48 hours
            const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
            filter.status = 'Active';
            filter.expiresAt = { $gt: now, $lte: in48Hours };
        } else {
            filter.status = query.status;
        }
    }

    // Role-based scoping: Admins see all; subuser creators see accounts created by them (or all if permitted)
    if (actor && actor.role !== 'Admin' && query.scopedOnly === 'true') {
        filter['createdBy._id'] = actor._id || actor.id;
    }

    const guestUsers = await GuestUser.find(filter).sort({ createdAt: -1 }).lean();

    // Annotate with live remaining time calculations
    return guestUsers.map(u => {
        const expTime = new Date(u.expiresAt).getTime();
        const diffMs = expTime - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

        let computedStatus = u.status;
        if (u.status === 'Active') {
            if (diffMs <= 0) {
                computedStatus = 'Expired';
            } else if (diffDays <= 2) {
                computedStatus = 'Expiring Soon';
            }
        }

        return {
            ...u,
            computedStatus,
            daysRemaining: Math.max(0, diffDays),
            hoursRemaining: Math.max(0, diffHours),
            isExpired: diffMs <= 0,
            isExpiringSoon: u.status === 'Active' && diffDays <= 2 && diffDays > 0
        };
    });
};

/**
 * Get guest user by ID.
 */
export const getGuestUserById = async (id) => {
    const user = await GuestUser.findById(id).lean();
    if (!user) {
        const error = new Error('Guest user not found.');
        error.status = 404;
        throw error;
    }
    return user;
};

/**
 * Updates guest user details.
 */
export const updateGuestUser = async (id, data, actor) => {
    const guestUser = await GuestUser.findById(id);
    if (!guestUser) {
        const error = new Error('Guest user not found.');
        error.status = 404;
        throw error;
    }

    if (data.name) guestUser.name = data.name.trim();
    if (data.organization !== undefined) guestUser.organization = data.organization.trim();
    if (data.purpose !== undefined) guestUser.purpose = data.purpose.trim();
    if (data.email !== undefined) guestUser.email = data.email.trim().toLowerCase();
    if (data.status && ['Active', 'Expired', 'Disabled'].includes(data.status)) {
        guestUser.status = data.status;
    }

    if (data.phone) {
        const { clean10, e164, isValid } = normalizeIndianPhoneNumber(data.phone);
        if (!isValid) {
            const error = new Error('Please enter a valid 10-digit Indian mobile number.');
            error.status = 400;
            throw error;
        }
        if (clean10 !== guestUser.phone) {
            const conflict = await GuestUser.findOne({ phone: clean10, _id: { $ne: id } });
            if (conflict) {
                const error = new Error(`Another guest account with mobile number ${clean10} already exists.`);
                error.status = 409;
                throw error;
            }
            guestUser.phone = clean10;
            guestUser.formattedPhone = e164;
        }
    }

    if (data.customFields) {
        guestUser.customFields = data.customFields;
    }

    await guestUser.save();

    await logAudit(actor, 'GUEST_USER_UPDATED', {
        guestId: guestUser._id,
        name: guestUser.name,
        phone: guestUser.phone,
        status: guestUser.status
    });

    return guestUser;
};

/**
 * Confirms and extends a guest user's access duration.
 * Durations: 15 days, 45 days, 1 month (30d), 3 months (90d), 6 months (180d).
 */
export const extendGuestUserAccess = async (id, durationKey, actor) => {
    const days = DURATION_DAYS_MAP[durationKey];
    const label = DURATION_LABELS_MAP[durationKey];

    if (!days || !label) {
        const error = new Error('Invalid extension duration. Options: 15 days, 45 days, 1 month, 3 months, 6 months.');
        error.status = 400;
        throw error;
    }

    const guestUser = await GuestUser.findById(id);
    if (!guestUser) {
        const error = new Error('Guest user not found.');
        error.status = 404;
        throw error;
    }

    const previousExpiresAt = new Date(guestUser.expiresAt);
    const now = new Date();
    const durationMs = days * 24 * 60 * 60 * 1000;

    // If currently active and unexpired, append to remaining time; if already expired, add from now
    const baseTime = previousExpiresAt > now ? previousExpiresAt.getTime() : now.getTime();
    const newExpiresAt = new Date(baseTime + durationMs);

    guestUser.extensionHistory.push({
        extendedAt: now,
        extendedBy: {
            _id: actor._id || actor.id || null,
            name: actor.name || 'Admin',
            email: actor.email || ''
        },
        durationDays: days,
        durationLabel: label,
        previousExpiresAt,
        newExpiresAt
    });

    guestUser.expiresAt = newExpiresAt;
    guestUser.status = 'Active';
    guestUser.notificationStatus = 'Confirmed';
    guestUser.rejectionReason = '';
    guestUser.totalDurationDays = (guestUser.totalDurationDays || 15) + days;

    await guestUser.save();

    await logAudit(actor, 'GUEST_USER_EXTENDED', {
        guestId: guestUser._id,
        duration: label,
        previousExpiresAt,
        newExpiresAt
    });

    return guestUser;
};

/**
 * Rejects extension request and marks guest account expired.
 */
export const rejectGuestUserExtension = async (id, reason = '', actor) => {
    const guestUser = await GuestUser.findById(id);
    if (!guestUser) {
        const error = new Error('Guest user not found.');
        error.status = 404;
        throw error;
    }

    guestUser.status = 'Expired';
    guestUser.notificationStatus = 'Rejected';
    guestUser.rejectionReason = reason || 'Extension rejected by administrator';
    await guestUser.save();

    await logAudit(actor, 'GUEST_USER_REJECTED', {
        guestId: guestUser._id,
        reason: guestUser.rejectionReason
    });

    return guestUser;
};

/**
 * Fetches all pending expiry notifications (guest users on 14th day or expiring within 48h).
 */
export const getExpiringGuestNotifications = async (actor) => {
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const filter = {
        status: 'Active',
        expiresAt: { $lte: in48Hours }
    };

    if (actor && actor.role !== 'Admin') {
        filter['createdBy._id'] = actor._id || actor.id;
    }

    const expiringUsers = await GuestUser.find(filter).sort({ expiresAt: 1 }).lean();

    return expiringUsers.map(u => {
        const diffMs = new Date(u.expiresAt).getTime() - now.getTime();
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
            ...u,
            hoursRemaining: Math.max(0, diffHours),
            daysRemaining: Math.max(0, diffDays),
            isExpired: diffMs <= 0
        };
    });
};

export default {
    createGuestUser,
    getGuestUsers,
    getGuestUserById,
    updateGuestUser,
    extendGuestUserAccess,
    rejectGuestUserExtension,
    getExpiringGuestNotifications
};
