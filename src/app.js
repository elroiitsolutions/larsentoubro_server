import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error.middleware.js';
import routes from './routes/index.js';
import mongoose from 'mongoose';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/ping', (req, res) => {
    res.status(200).json({ message: 'pong' });
});

app.get('/test-db', async (req, res) => {
    try {
        const stores = await mongoose.connection.db.collection('stores').find().toArray();
        res.json(stores);
    } catch (e) {
        res.status(500).json({ error: e.toString() });
    }
});

// API Routes
app.use('/api', routes);

// 404 Handler
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global Error Handler
app.use(errorHandler);

export default app;
