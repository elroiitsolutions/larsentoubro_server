import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(env.MONGO_URI, {
            dbName: 'lt',
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000
        });
        console.log(`[Database] MongoDB Connected: ${conn.connection.host}, DB: ${conn.connection.db.databaseName}`);
        
        // Ensure any existing 'Returned' challans are updated to 'Completed'
        try {
            await conn.connection.db.collection('challans').updateMany(
                { status: 'Returned' },
                { $set: { status: 'Completed' } }
            );
        } catch (updateErr) {
            console.warn(`[Database] Minor warning during initial challans update:`, updateErr.message);
        }
    } catch (error) {
        console.error(`[Database] Connection error: ${error.message}`);
        console.log(`[Database] Retrying MongoDB connection in 5 seconds...`);
        setTimeout(connectDB, 5000);
    }
};
