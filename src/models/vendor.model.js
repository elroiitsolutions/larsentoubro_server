import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const vendorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    vendorCode: { type: String, unique: true, required: true, uppercase: true, trim: true },
    address: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    contactDesignation: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    alternatePhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    projects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: []
    }],
    stores: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        default: []
    }],
    allowedPages: {
        type: [String],
        default: ["/projects", "/stores", "/tools"]
    },
    password: { type: String, default: '' },
    metrics: {
        dcCount: { type: Number, default: 0 },
        rcCount: { type: Number, default: 0 },
        returnedCount: { type: Number, default: 0 },
        missingCount: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Pre-save hook to hash password
vendorSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to verify password
vendorSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    if (this.password === candidatePassword) return true; // Direct match fallback if unhashed
    return await bcrypt.compare(candidatePassword, this.password);
};

export const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
