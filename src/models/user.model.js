import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phonenumber: {
        type: String,
        required: true,
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
        required: true
    },
    role: {
        type: String,
        enum: ['Admin', 'User', 'Vendor'],
        default: 'User'
    },
    user_id: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    allowedPages: {
        type: [String],
        default: ["/dashboard", "/projects", "/stores"]
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
}, { timestamps: true });

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
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
    return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);
