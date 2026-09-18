import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { startExpiryWorker } from './services/expiry.service.js';
import migrateProfilesAndForms from './scripts/migrateProfiles.js';

const server = http.createServer(app);

const startServer = async () => {
    await connectDB();
    await migrateProfilesAndForms().catch(err => console.error("Migration error:", err));
    startExpiryWorker();
    server.listen(env.PORT, () => {
        console.log(`[Server] running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
};

startServer();
