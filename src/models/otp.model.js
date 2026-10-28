import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    otp: {
        type: String,
        required: true,
        trim: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    maxAttempts: {
        type: Number,
        default: 5
    },
    lastSentAt: {
        type: Date,
        default: Date.now
    },
    isUsed: {
        type: Boolean,
        default: false,
        index: true
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    }
}, { timestamps: true });

// TTL index to automatically purge expired OTP documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, isUsed: 1, expiresAt: 1 });

export const Otp = mongoose.model('Otp', otpSchema);
export default Otp;
