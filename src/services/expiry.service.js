import { LoginRequest } from '../models/loginRequest.model.js';
import { GuestUser } from '../models/guestUser.model.js';
import { realtimeService } from './socket.service.js';

/**
 * [SHARED] Background Expiry Worker
 * Runs every 60 seconds to:
 * 1. Expire timed out multi-device login requests.
 * 2. Auto-expire guest accounts that reached their 15-day (or extended) limit.
 * 3. Emit 14th-day expiry warning notifications to Admins and the creating user.
 */
export function startExpiryWorker() {
    // Run every 60 seconds
    setInterval(async () => {
        try {
            const now = new Date();

            // 1. Check Login Requests older than 10 minutes
            const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
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

            // 2. Auto-expire Guest Users whose expiration date has passed
            const expiredGuests = await GuestUser.find({
                status: 'Active',
                expiresAt: { $lte: now }
            });

            if (expiredGuests.length > 0) {
                const expiredGuestIds = expiredGuests.map(g => g._id);
                await GuestUser.updateMany(
                    { _id: { $in: expiredGuestIds } },
                    { $set: { status: 'Expired', notificationStatus: 'Expired' } }
                );

                console.log(`[ExpiryWorker] Auto-expired ${expiredGuestIds.length} guest user account(s).`);

                // Broadcast expiration notice to admins and creators
                expiredGuests.forEach(guest => {
                    const noticeData = {
                        guestId: String(guest._id),
                        name: guest.name,
                        phone: guest.phone,
                        status: 'Expired',
                        message: `Guest account for ${guest.name} (${guest.phone}) has automatically expired.`
                    };
                    realtimeService.notifyAdmins('guest_expired', noticeData);
                    if (guest.createdBy && guest.createdBy._id) {
                        realtimeService.notifyUser(String(guest.createdBy._id), 'guest_expired', noticeData);
                    }
                });
            }

            // 3. 14th-Day Notification: accounts expiring within 24 hours that haven't been notified yet
            const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const expiringSoonGuests = await GuestUser.find({
                status: 'Active',
                notificationStatus: { $in: ['None', null] },
                expiresAt: { $gt: now, $lte: in24Hours }
            });

            if (expiringSoonGuests.length > 0) {
                for (const guest of expiringSoonGuests) {
                    guest.notificationStatus = 'Pending';
                    guest.notificationSentAt = now;
                    await guest.save();

                    const diffHours = Math.max(1, Math.ceil((new Date(guest.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60)));
                    const payload = {
                        guestId: String(guest._id),
                        name: guest.name,
                        phone: guest.phone,
                        expiresAt: guest.expiresAt,
                        hoursRemaining: diffHours,
                        createdBy: guest.createdBy,
                        message: `Guest user "${guest.name}" (${guest.phone}) will expire in ${diffHours} hour(s). Action required: Confirm Extension or Reject.`
                    };

                    realtimeService.notifyAdmins('guest_expiring_soon', payload);
                    if (guest.createdBy && guest.createdBy._id) {
                        realtimeService.notifyUser(String(guest.createdBy._id), 'guest_expiring_soon', payload);
                    }
                }
                console.log(`[ExpiryWorker] Dispatched 14th-day notifications for ${expiringSoonGuests.length} guest account(s).`);
            }
        } catch (error) {
            console.error('[ExpiryWorker] Error executing expiry check:', error);
        }
    }, 60000);
}
