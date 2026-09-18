import * as profileService from './profile.service.js';

export const getVendors = async (params = {}) => {
    const result = await profileService.getProfiles({
        ...params,
        profileType: 'Subcontractor'
    });

    const mappedData = (result.data || []).map(p => ({
        _id: p._id.toString(),
        name: p.name,
        vendorCode: p.code,
        code: p.code,
        address: p.address || '',
        contactPerson: p.contactPerson || '',
        contactDesignation: p.contactDesignation || '',
        contactPhone: p.contactPhone || '',
        alternatePhone: p.alternatePhone || '',
        contactEmail: p.contactEmail || '',
        gstNumber: p.gstNumber || '',
        panNumber: p.panNumber || '',
        status: p.status || 'Active',
        projects: p.projects || [],
        stores: p.stores || [],
        allowedPages: ['/stores', '/tools'],
        metrics: p.metrics || { dcCount: 0, rcCount: 0, returnedCount: 0, missingCount: 0 }
    }));

    return {
        ...result,
        data: mappedData
    };
};

export const getVendorById = async (id) => {
    const profile = await profileService.getProfileById(id);
    return {
        ...profile,
        vendorCode: profile.code,
        allowedPages: ['/stores', '/tools']
    };
};

export const createVendor = async (data) => {
    const profilePayload = {
        ...data,
        profileType: 'Subcontractor',
        code: data.vendorCode || data.code
    };
    const created = await profileService.createProfile(profilePayload);
    return {
        ...created.toObject(),
        vendorCode: created.code
    };
};

export const updateVendor = async (id, data) => {
    if (data.vendorCode) {
        data.code = data.vendorCode;
    }
    const updated = await profileService.updateProfile(id, data);
    return {
        ...updated.toObject(),
        vendorCode: updated.code
    };
};

export const deleteVendor = async (id) => {
    return await profileService.deleteProfile(id);
};

export const updateVendorMetrics = async (vendorId, deltas = {}, session = null) => {
    await profileService.updateProfileMetrics(vendorId, deltas, session);
};
