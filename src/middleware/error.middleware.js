import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || err.status || (res.statusCode !== 200 ? res.statusCode : 500);
    
    console.error(`[Error] ${err.message}`);
    
    res.status(statusCode).json({
        success: false,
        message: err.message,
        stack: env.NODE_ENV === 'production' ? null : err.stack,
    });
};
