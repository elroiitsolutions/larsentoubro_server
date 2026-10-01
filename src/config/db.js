import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(env.MONGO_URI, {
            dbName: 'lt'
        });
        console.log(`[Database] MongoDB Connected: ${conn.connection.host}, DB: ${conn.connection.db.databaseName}`);
        
        // Ensure any existing 'Returned' challans are updated to 'Completed'
        await conn.connection.db.collection('challans').updateMany(
            { status: 'Returned' },
            { $set: { status: 'Completed' } }
        );
    } catch (error) {
        console.error(`[Database] Connection error: ${error.message}`);
        process.exit(1);
    }
};
