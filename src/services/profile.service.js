import { Profile } from '../models/profile.model.js';
import mongoose from 'mongoose';

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

export const createProfile = async (data, user = {}) => {
    if (!data.profileType || !['Subcontractor', 'ScrapDealer', 'Supplier'].includes(data.profileType)) {
        throw new Error('Valid profileType (Subcontractor, ScrapDealer, Supplier) is required');
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
            throw new Error('Unauthorized to modify this profile');
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

export const addDocument = async (profileId, docData) => {
    const profile = await Profile.findById(profileId);
    if (!profile) {
        throw new Error('Profile not found');
    }
    profile.documents.push(docData);
    await profile.save();
    return profile;
};

export const deleteDocument = async (profileId, docId) => {
    const profile = await Profile.findById(profileId);
    if (!profile) {
        throw new Error('Profile not found');
    }
    profile.documents = profile.documents.filter(d => d._id.toString() !== docId.toString());
    await profile.save();
    return profile;
};

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
