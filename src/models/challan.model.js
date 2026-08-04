import mongoose from 'mongoose';

const challanItemSchema = new mongoose.Schema({
    tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true },
    toolId: { type: String, required: true },
    description: { type: String, default: '' },
    toolCode: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: 'NOS' },
    rate: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    returnStatus: { 
        type: String, 
        enum: ['Sent', 'Returned', 'Missing'], 
        default: 'Sent' 
    }
}, { _id: false });

const challanSchema = new mongoose.Schema({
    challanNumber: { type: String, unique: true, required: true, index: true },
    challanType: { type: String, enum: ['Delivery', 'Return'], required: true },
    status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active', index: true },
    vendor: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        name: { type: String, required: true },
        vendorCode: { type: String, default: '' },
        address: { type: String, default: '' },
        gstNumber: { type: String, default: '' },
        contactPerson: { type: String, default: '' },
        contactPhone: { type: String, default: '' }
    },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: false },
    challanDate: { type: Date, default: Date.now },
    deliveryDate: { type: Date, default: Date.now },
    remarks: { type: String, default: '' },
    notes: { type: String, default: '' },
    referenceDcId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan', default: null },
    referenceDcNumber: { type: String, default: '' },
    items: [challanItemSchema],
    toolCount: { type: Number, default: 0 },
    returnedCount: { type: Number, default: 0 },
    missingCount: { type: Number, default: 0 },
    createdBy: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, default: 'L&T Admin' },
        email: { type: String, default: 'admin@landt.com' }
    }
}, {
    timestamps: true
});

export const Challan = mongoose.model('Challan', challanSchema);
export default Challan;
