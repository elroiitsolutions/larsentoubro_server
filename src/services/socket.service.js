import EventEmitter from 'events';

class RealtimeService extends EventEmitter {
    constructor() {
        super();
        this.sseClients = new Map(); // clientId -> { res, userId, role }
        this.onlineUserIds = new Set();
    }

    // Register SSE Client Connection
    addClient(clientId, res, user = null) {
        const role = user?.role || 'User';
        const userId = user?.id || user?._id || null;

        this.sseClients.set(clientId, { res, userId: String(userId), role, user });
        if (userId) {
            this.onlineUserIds.add(String(userId));
            this.broadcastOnlineUsers();
        }

        res.on('close', () => {
            this.removeClient(clientId);
        });
    }

    removeClient(clientId) {
        const client = this.sseClients.get(clientId);
        if (client && client.userId) {
            this.sseClients.delete(clientId);

            // Check if user has other open connections
            const stillConnected = Array.from(this.sseClients.values()).some(c => c.userId === client.userId);
            if (!stillConnected) {
                this.onlineUserIds.delete(client.userId);
                this.broadcastOnlineUsers();
            }
        } else {
            this.sseClients.delete(clientId);
        }
    }

    getOnlineUserIds() {
        return Array.from(this.onlineUserIds);
    }

    broadcastOnlineUsers() {
        const payload = {
            event: 'online_users_updated',
            data: { onlineUsers: this.getOnlineUserIds() }
        };
        this.broadcastAll(payload);
    }

    // Send payload to all connected Clients
    broadcastAll(payload) {
        const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
        this.sseClients.forEach(({ res }) => {
            try {
                res.write(dataStr);
            } catch (e) {
                // Ignore write errors for closed sockets
            }
        });
    }

    // Send payload to Admins
    notifyAdmins(event, data) {
        const payload = { event, data };
        const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
        
        this.sseClients.forEach(({ res, role }) => {
            if (role === 'Admin' || role === 'ADMIN') {
                try {
                    res.write(dataStr);
                } catch (e) {}
            }
        });
    }

    // Send payload to specific request or user
    notifyRequest(requestId, event, data) {
        const payload = { event, data, requestId };
        const dataStr = `data: ${JSON.stringify(payload)}\n\n`;

        this.sseClients.forEach(({ res }) => {
            try {
                res.write(dataStr);
            } catch (e) {}
        });
    }
}

export const realtimeService = new RealtimeService();
