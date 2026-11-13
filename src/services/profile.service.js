import { Profile } from '../models/profile.model.js';
import { FormDefinition } from '../models/formDefinition.model.js';
import mongoose from 'mongoose';

/**
 * [SHARED] & [WEB] Profile Directory Service
 * Central enterprise directory for Subcontractors, Vendors, Manufacturers, Clients, and Staff.
 * - [SHARED]: getProfiles, getProfileById, createProfile, updateProfile, deleteProfile, updateProfileMetrics.
 * - [WEB]: addDocument, deleteDocument (Web profile document management).
 */

/**
 * [SHARED] getProfiles - Query profiles with role, status, and text search
 */
export const getProfiles = async (params = {}, user = null) => {
    const { profileType, page = 1, limit = 50, search = '', status = 'All' } = params;

    const query = {};

    if (profileType) {
        query.profileType = profileType;
    }

    if (status && status !== 'All') {
        query.status = status;
    }

    // Profiles are central enterprise records accessible across all users.
    if (search) {
        const searchConditions = [
            { name: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } },
            { contactPerson: { $regex: search, $options: 'i' } },
            { contactPhone: { $regex: search, $options: 'i' } },
            { contactEmail: { $regex: search, $options: 'i' } },
            { gstNumber: { $regex: search, $options: 'i' } },
            { panNumber: { $regex: search, $options: 'i' } },
            { licenseNumber: { $regex: search, $options: 'i' } }
        ];

        if (query.$and) {
            query.$and.push({ $or: searchConditions });
        } else {
            query.$or = searchConditions;
        }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [data, total] = await Promise.all([
        Profile.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate('projects', 'name projectCode location')
            .populate('stores', 'name location')
            .lean(),
        Profile.countDocuments(query)
    ]);

    return {
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1
    };
};

export const getProfileById = async (id, user = null) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid Profile ID');
    }
    const profile = await Profile.findById(id)
        .populate('projects', 'name projectCode location')
        .populate('stores', 'name location')
        .lean();
    if (!profile) {
        throw new Error('Profile not found');
    }

    return profile;
};

export const generateProfileCode = async (profileType) => {
    const prefixes = {
        Subcontractor: 'SUB',
        ScrapDealer: 'SCR',
        Supplier: 'SUP'
    };
    const prefix = prefixes[profileType] || 'PRF';
    const count = await Profile.countDocuments({ profileType });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

export const validateIndianMobile = (rawMobile, fieldName = 'Phone Number') => {
    const val = (rawMobile || '').trim();
    if (!val) {
        return { isValid: false, error: `${fieldName} is required.` };
    }
    if (/\D/.test(val)) {
        return {
            isValid: false,
            error: `${fieldName} must contain only 10 numbers without spaces, letters, or country code (+91).`
        };
    }
    if (val.length !== 10) {
        return {
            isValid: false,
            error: `${fieldName} must be exactly 10 digits without country code.`
        };
    }
    if (!/^[6-9]/.test(val)) {
        return {
            isValid: false,
            error: `${fieldName} must be a valid Indian mobile number starting with 6, 7, 8, or 9.`
        };
    }
    return { isValid: true };
};

export const validateEmailAddress = (rawEmail, fieldName = 'Email Address') => {
    const email = (rawEmail || '').trim().toLowerCase();
    if (!email) {
        return { isValid: false, error: `${fieldName} is required.` };
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/i;
    if (!email.includes('@') || !email.includes('.') || !emailRegex.test(email)) {
        return {
            isValid: false,
            error: `Invalid ${fieldName} format. Must contain "@" and "." (e.g. name@domain.com).`
        };
    }
    return { isValid: true };
};

const validateProfileAgainstSchema = async (profileType, data) => {
    const slug = profileType === 'Subcontractor'
        ? 'subcontractor-form'
        : profileType === 'ScrapDealer'
        ? 'scrap-dealer-form'
        : 'supplier-form';

    const formDef = await FormDefinition.findOne({ slug, isActive: true });
    if (!formDef || !Array.isArray(formDef.fields)) return;

    for (const field of formDef.fields) {
        const isReq = Boolean(
            field.required ||
            (Array.isArray(field.validations) && field.validations.some(v => v.type === 'required'))
        );

        let val = data[field.name];
        if (val === undefined || val === null || String(val).trim() === '') {
            if (field.name === 'contactEmail' || field.name === 'email') {
                val = data.contactEmail || data.email || (data.keyPersonnel && data.keyPersonnel[0]?.email);
            } else if (field.name === 'contactPhone' || field.name === 'phone') {
                val = data.contactPhone || data.phone || (data.keyPersonnel && data.keyPersonnel[0]?.phone);
            } else if (field.name === 'contactPerson') {
                val = data.contactPerson || (data.keyPersonnel && data.keyPersonnel[0]?.name);
            } else if (field.name === 'contactDesignation' || field.name === 'designation') {
                val = data.contactDesignation || (data.keyPersonnel && data.keyPersonnel[0]?.designation);
            } else if (field.name === 'alternatePhone') {
                val = data.alternatePhone || (data.keyPersonnel && data.keyPersonnel[0]?.alternatePhone);
            } else if (data.customFields) {
                if (typeof data.customFields.get === 'function') {
                    val = data.customFields.get(field.name) || data.customFields.get(field.id);
                } else {
                    val = data.customFields[field.name] || data.customFields[field.id];
                }
            }
        }

        if (isReq && (val === undefined || val === null || String(val).trim() === '')) {
            const msg = (field.validations && field.validations.find(v => v.type === 'required')?.message)
                || `${field.label || field.name} is required`;
            const err = new Error(msg);
            err.status = 400;
            throw err;
        }

        // Validate Indian mobile phone format (10 digits, starts with 6-9, no country code)
        const fieldNameLower = String(field.name || '').toLowerCase();
        if (fieldNameLower.includes('phone') || field.type === 'phone') {
            if (val && String(val).trim()) {
                const check = validateIndianMobile(String(val).trim(), field.label || field.name);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
        }

        // Validate Email format (@ and . check)
        if (fieldNameLower.includes('email') || field.type === 'email') {
            if (val && String(val).trim()) {
                const check = validateEmailAddress(String(val).trim(), field.label || field.name);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
        }
    }
};

export const createProfile = async (data, user = {}) => {
    if (!data.profileType || !['Subcontractor', 'ScrapDealer', 'Supplier'].includes(data.profileType)) {
        throw new Error('Valid profileType (Subcontractor, ScrapDealer, Supplier) is required');
    }

    // Validate all required fields configured in the Form Definition (standard + custom fields)
    await validateProfileAgainstSchema(data.profileType, data);

    // Validate phone & email format
    if (data.contactPhone && String(data.contactPhone).trim()) {
        const check = validateIndianMobile(String(data.contactPhone).trim(), 'Primary Phone Number');
        if (!check.isValid) {
            const err = new Error(check.error);
            err.status = 400;
            throw err;
        }
    }
    if (data.alternatePhone && String(data.alternatePhone).trim()) {
        const check = validateIndianMobile(String(data.alternatePhone).trim(), 'Alternate Phone Number');
        if (!check.isValid) {
            const err = new Error(check.error);
            err.status = 400;
            throw err;
        }
    }
    if (data.contactEmail && String(data.contactEmail).trim()) {
        const check = validateEmailAddress(String(data.contactEmail).trim(), 'Email Address');
        if (!check.isValid) {
            const err = new Error(check.error);
            err.status = 400;
            throw err;
        }
    }
    if (Array.isArray(data.keyPersonnel)) {
        for (let i = 0; i < data.keyPersonnel.length; i++) {
            const kp = data.keyPersonnel[i];
            const prefix = data.keyPersonnel.length > 1 ? `Key Personnel #${i + 1} ` : '';
            if (kp.phone && String(kp.phone).trim()) {
                const check = validateIndianMobile(String(kp.phone).trim(), `${prefix}Phone Number`);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
            if (kp.alternatePhone && String(kp.alternatePhone).trim()) {
                const check = validateIndianMobile(String(kp.alternatePhone).trim(), `${prefix}Alternate Phone Number`);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
            if (kp.email && String(kp.email).trim()) {
                const check = validateEmailAddress(String(kp.email).trim(), `${prefix}Email Address`);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
        }
    }

    let code = data.code ? data.code.trim().toUpperCase() : '';
    if (!code) {
        code = await generateProfileCode(data.profileType);
    }

    const existing = await Profile.findOne({ profileType: data.profileType, code });
    if (existing) {
        throw new Error(`${data.profileType} code '${code}' already exists`);
    }

    const creatorUser = (user && user._id) ? user : (data.createdBy || {});
    const createdBy = {
        _id: creatorUser._id || null,
        name: creatorUser.name || creatorUser.username || data.createdBy?.name || 'Admin',
        email: creatorUser.email || data.createdBy?.email || '',
        role: creatorUser.role || data.createdBy?.role || 'Admin'
    };

    const profilePayload = {
        ...data,
        code,
        name: data.name ? data.name.trim() : 'Unnamed Profile',
        gstNumber: data.gstNumber ? data.gstNumber.trim().toUpperCase() : '',
        panNumber: data.panNumber ? data.panNumber.trim().toUpperCase() : '',
        createdBy: (user && user._id) ? createdBy : (data.createdBy && data.createdBy.name ? data.createdBy : createdBy)
    };

    const profile = new Profile(profilePayload);
    const saved = await profile.save();
    return await Profile.findById(saved._id)
        .populate('projects', 'name projectCode location')
        .populate('stores', 'name location');
};

export const updateProfile = async (id, data, user = null) => {
    // Prevent modification of profileType or password fields
    delete data.password;

    const existing = await Profile.findById(id).lean();
    if (!existing) {
        throw new Error('Profile not found');
    }

    if (user && user.role !== 'Admin') {
        const isSelfCreated = existing.createdBy && (
            (existing.createdBy._id && existing.createdBy._id.toString() === user._id?.toString()) ||
            (existing.createdBy.email && user.email && existing.createdBy.email.toLowerCase() === user.email.toLowerCase()) ||
            (existing.createdBy.name && user.name && existing.createdBy.name.toLowerCase() === user.name.toLowerCase()) ||
            (existing.createdBy.name && user.username && existing.createdBy.name.toLowerCase() === user.username.toLowerCase())
        );
        if (!isSelfCreated) {
            throw new Error('Unauthorized to modify this profile');
        }
    }

    // Validate updated data against dynamic form schema
    const profileType = existing.profileType || data.profileType;
    await validateProfileAgainstSchema(profileType, { ...existing, ...data });

    // Validate phone & email format
    if (data.contactPhone && String(data.contactPhone).trim()) {
        const check = validateIndianMobile(String(data.contactPhone).trim(), 'Primary Phone Number');
        if (!check.isValid) {
            const err = new Error(check.error);
            err.status = 400;
            throw err;
        }
    }
    if (data.alternatePhone && String(data.alternatePhone).trim()) {
        const check = validateIndianMobile(String(data.alternatePhone).trim(), 'Alternate Phone Number');
        if (!check.isValid) {
            const err = new Error(check.error);
            err.status = 400;
            throw err;
        }
    }
    if (data.contactEmail && String(data.contactEmail).trim()) {
        const check = validateEmailAddress(String(data.contactEmail).trim(), 'Email Address');
        if (!check.isValid) {
            const err = new Error(check.error);
            err.status = 400;
            throw err;
        }
    }
    if (Array.isArray(data.keyPersonnel)) {
        for (let i = 0; i < data.keyPersonnel.length; i++) {
            const kp = data.keyPersonnel[i];
            const prefix = data.keyPersonnel.length > 1 ? `Key Personnel #${i + 1} ` : '';
            if (kp.phone && String(kp.phone).trim()) {
                const check = validateIndianMobile(String(kp.phone).trim(), `${prefix}Phone Number`);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
            if (kp.alternatePhone && String(kp.alternatePhone).trim()) {
                const check = validateIndianMobile(String(kp.alternatePhone).trim(), `${prefix}Alternate Phone Number`);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
            if (kp.email && String(kp.email).trim()) {
                const check = validateEmailAddress(String(kp.email).trim(), `${prefix}Email Address`);
                if (!check.isValid) {
                    const err = new Error(check.error);
                    err.status = 400;
                    throw err;
                }
            }
        }
    }

    const profile = await Profile.findByIdAndUpdate(id, data, { new: true, runValidators: true })
        .populate('projects', 'name projectCode location')
        .populate('stores', 'name location');
    if (!profile) {
        throw new Error('Profile not found');
    }
    return profile;
};

export const deleteProfile = async (id, user = null) => {
    if (user && user.role !== 'Admin') {
        const existing = await Profile.findById(id).lean();
        if (!existing) {
            throw new Error('Profile not found');
        }
        const isSelfCreated = existing.createdBy && (
            (existing.createdBy._id && existing.createdBy._id.toString() === user._id?.toString()) ||
            (existing.createdBy.email && user.email && existing.createdBy.email.toLowerCase() === user.email.toLowerCase()) ||
            (existing.createdBy.name && user.name && existing.createdBy.name.toLowerCase() === user.name.toLowerCase()) ||
            (existing.createdBy.name && user.username && existing.createdBy.name.toLowerCase() === user.username.toLowerCase())
        );
        if (!isSelfCreated) {
            throw new Error('Unauthorized to delete this profile');
        }
    }

    const profile = await Profile.findByIdAndDelete(id);
    if (!profile) {
        throw new Error('Profile not found');
    }
    return profile;
};

/**
 * [WEB] addDocument - Attach a file document record to profile
 * Exclusively consumed by Web profile management UI.
 */
export const addDocument = async (profileId, docData) => {
    const profile = await Profile.findById(profileId);
    if (!profile) {
        throw new Error('Profile not found');
    }
    profile.documents.push(docData);
    await profile.save();
    return profile;
};

/**
 * [WEB] deleteDocument - Remove an attached file document record from profile
 * Exclusively consumed by Web profile management UI.
 */
export const deleteDocument = async (profileId, docId) => {
    const profile = await Profile.findById(profileId);
    if (!profile) {
        throw new Error('Profile not found');
    }
    profile.documents = profile.documents.filter(d => d._id.toString() !== docId.toString());
    await profile.save();
    return profile;
};

/**
 * [SHARED] updateProfileMetrics - Increment or decrement profile lifecycle counters (DC, RC, scrap, missing)
 * Used across Delivery and Return Challan workflows in both Web and Mobile.
 */
export const updateProfileMetrics = async (profileId, deltas = {}, session = null) => {
    if (!profileId) return;
    const { dcDelta = 0, rcDelta = 0, returnedDelta = 0, missingDelta = 0, scrapDelta = 0, supplyDelta = 0 } = deltas;
    const update = {
        $inc: {
            'metrics.dcCount': dcDelta,
            'metrics.rcCount': rcDelta,
            'metrics.returnedCount': returnedDelta,
            'metrics.missingCount': missingDelta,
            'metrics.scrapCount': scrapDelta,
            'metrics.supplyCount': supplyDelta
        }
    };
    const options = { new: true };
    if (session) options.session = session;
    await Profile.findByIdAndUpdate(profileId, update, options);
};
