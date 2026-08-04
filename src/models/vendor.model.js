import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    vendorCode: { type: String, unique: true, required: true, uppercase: true, trim: true },
    address: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    metrics: {
        dcCount: { type: Number, default: 0 },
        rcCount: { type: Number, default: 0 },
        returnedCount: { type: Number, default: 0 },
        missingCount: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

export const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
