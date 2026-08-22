import { LoginRequest } from '../models/loginRequest.model.js';
import { realtimeService } from './socket.service.js';

export function startExpiryWorker() {
    // Run every 60 seconds
    setInterval(async () => {
        try {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            
            const expiredRequests = await LoginRequest.find({
                status: 'PENDING',
                requestedAt: { $lt: tenMinutesAgo }
            });

            if (expiredRequests.length > 0) {
                const expiredIds = expiredRequests.map(r => r._id);
                
                await LoginRequest.updateMany(
                    { _id: { $in: expiredIds } },
                    { $set: { status: 'EXPIRED' } }
                );

                expiredIds.forEach(id => {
                    realtimeService.notifyRequest(String(id), 'login_expired', {
                        requestId: String(id),
                        message: 'Login request timed out after 10 minutes'
                    });
                });

                console.log(`[ExpiryWorker] Expired ${expiredIds.length} pending login requests.`);
            }
        } catch (error) {
            console.error('[ExpiryWorker] Error executing expiry check:', error);
        }
    }, 60000);
}
