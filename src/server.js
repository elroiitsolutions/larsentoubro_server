import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

const server = http.createServer(app);

const startServer = async () => {
    await connectDB();
    server.listen(env.PORT, () => {
        console.log(`[Server] running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
};

startServer();
