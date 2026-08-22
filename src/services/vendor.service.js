import { Vendor } from '../models/vendor.model.js';
import { User } from '../models/user.model.js';

export const getVendors = async (params = {}) => {
    const { page = 1, limit = 50, search = '' } = params;

    // Remove any previously seeded mock vendors from the Vendor collection so they never appear
    await Vendor.deleteMany({ vendorCode: { $in: ['V-LNT01', 'V-ALP02', 'V-BLD03'] } }).catch(() => {});

    const userQuery = { role: 'Vendor' };
    const vendorQuery = {};

    if (search) {
        userQuery.$or = [
            { name: { $regex: search, $options: 'i' } },
            { user_id: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phonenumber: { $regex: search, $options: 'i' } }
        ];
        vendorQuery.$or = [
            { name: { $regex: search, $options: 'i' } },
            { vendorCode: { $regex: search, $options: 'i' } },
            { contactEmail: { $regex: search, $options: 'i' } },
            { contactPhone: { $regex: search, $options: 'i' } }
        ];
    }

    const [vendorUsers, dbVendors] = await Promise.all([
        User.find(userQuery).lean(),
        Vendor.find(vendorQuery).lean()
    ]);

    const mappedUsers = vendorUsers.map(u => ({
        _id: u._id.toString(),
        name: u.name || 'Vendor User',
        vendorCode: u.user_id || `V-${u._id.toString().substring(0, 6).toUpperCase()}`,
        address: u.address || 'Powai Campus, Saki Vihar Road, Mumbai',
        contactPerson: u.name || 'Vendor Contact',
        contactPhone: u.phonenumber || '',
        contactEmail: u.email || '',
        gstNumber: u.gstNumber || '27AAACL0140P1Z0',
        status: 'Active',
        metrics: { dcCount: 0, rcCount: 0, returnedCount: 0, missingCount: 0 }
    }));

    const mappedDbVendors = dbVendors.map(v => ({
        _id: v._id.toString(),
        name: v.name || 'Vendor',
        vendorCode: v.vendorCode || `V-${v._id.toString().substring(0, 6).toUpperCase()}`,
        address: v.address || '',
        contactPerson: v.contactPerson || v.name,
        contactPhone: v.contactPhone || '',
        contactEmail: v.contactEmail || '',
        gstNumber: v.gstNumber || '',
        status: v.status || 'Active',
        metrics: v.metrics || { dcCount: 0, rcCount: 0, returnedCount: 0, missingCount: 0 }
    }));

    const combinedMap = new Map();
    [...mappedUsers, ...mappedDbVendors].forEach(v => {
        if (v && v._id) {
            combinedMap.set(v._id, v);
        }
    });
    const combined = Array.from(combinedMap.values());

    const total = combined.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginated = combined.slice(skip, skip + Number(limit));

    return {
        data: paginated,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1
    };
};

export const getVendorById = async (id) => {
    const user = await User.findById(id).lean();
    if (user && user.role === 'Vendor') {
        return {
            _id: user._id,
            name: user.name || 'Vendor User',
            vendorCode: user.user_id || `V-${user._id.toString().substring(0, 6).toUpperCase()}`,
            address: user.address || 'Powai Campus, Saki Vihar Road, Mumbai',
            contactPerson: user.name || 'Vendor Contact',
            contactPhone: user.phonenumber || '',
            contactEmail: user.email || '',
            gstNumber: user.gstNumber || '27AAACL0140P1Z0',
            status: 'Active',
            metrics: { dcCount: 0, rcCount: 0, returnedCount: 0, missingCount: 0 }
        };
    }
    // Fallback check in Vendor collection if not found in User collection
    const vendor = await Vendor.findById(id).lean();
    if (!vendor) {
        throw new Error('Vendor not found');
    }
    return vendor;
};

export const createVendor = async (data) => {
    const existing = await Vendor.findOne({ vendorCode: data.vendorCode?.toUpperCase() });
    if (existing) {
        throw new Error('Vendor with this code already exists');
    }
    const vendor = new Vendor(data);
    return await vendor.save();
};

export const updateVendor = async (id, data) => {
    const vendor = await Vendor.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!vendor) {
        throw new Error('Vendor not found');
    }
    return vendor;
};

export const deleteVendor = async (id) => {
    const vendor = await Vendor.findByIdAndDelete(id);
    if (!vendor) {
        throw new Error('Vendor not found');
    }
    return vendor;
};

export const updateVendorMetrics = async (vendorId, { dcDelta = 0, rcDelta = 0, returnedDelta = 0, missingDelta = 0 }, session = null) => {
    if (!vendorId) return;
    const update = {
        $inc: {
            'metrics.dcCount': dcDelta,
            'metrics.rcCount': rcDelta,
            'metrics.returnedCount': returnedDelta,
            'metrics.missingCount': missingDelta
        }
    };
    const options = { new: true };
    if (session) options.session = session;
    const updated = await Vendor.findByIdAndUpdate(vendorId, update, options);
    if (!updated) {
        await User.findByIdAndUpdate(vendorId, update, options).catch(() => {});
    }
};
