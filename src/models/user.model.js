import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: false,
        default: '',
        trim: true
    },
    phonenumber: {
        type: String,
        required: false,
        default: '',
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: false,
        default: () => crypto.randomBytes(16).toString('hex')
    },
    role: {
        type: String,
        enum: ['Admin', 'User', 'Subuser', 'Vendor', 'Guest'],
        default: 'User'
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    parentUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    canCreateUser: {
        type: Boolean,
        default: false
    },
    user_id: {
        type: String,
        required: false,
        default: () => 'EMP-' + Math.floor(10000 + Math.random() * 90000),
        unique: true,
        trim: true,
        sparse: true
    },
    allowedPages: {
        type: [String],
        default: ["/dashboard", "/projects", "/stores"]
    },
    hasInspectionAccess: {
        type: Boolean,
        default: false
    },
    projects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: []
    }],
    stores: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        default: []
    }]
}, { timestamps: true, strict: false });

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
    if (!this.password) {
        this.password = crypto.randomBytes(16).toString('hex');
    }
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to verify password
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);
