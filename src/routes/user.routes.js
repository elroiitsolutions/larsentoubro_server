import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { userValidator } from '../validators/user.validator.js';
import { authenticate, requireAdmin, requireCreateUserPermission } from '../middleware/auth.middleware.js';

const router = Router();

// ==========================================
// [SHARED] & [WEB] Authentication & Session Routes
// ==========================================

/**
 * [SHARED] POST /api/users/login - Authenticate with credentials and issue JWT
 * Used by Web (auth.service.ts) and Mobile (authService.ts).
 */
router.post('/login', validate(userValidator.loginUser), userController.loginUser);

/**
 * [SHARED] POST /api/users/guest-login - Instant guest access for scanning/viewing tools
 * Used by Web and Mobile QR scanner view.
 */
router.post('/guest-login', userController.guestLogin);

/**
 * [WEB] POST /api/users/logout - Logout user, revoke session, and clear cookie/token
 * Exclusively consumed by Web client auth service.
 */
router.post('/logout', authenticate, userController.logoutUser);

/**
 * [WEB] GET /api/users/events - Realtime Server-Sent Events (SSE) notification stream
 * Exclusively consumed by Web client for live active sessions & notifications.
 */
router.get('/events', userController.streamRealtimeEvents);

/**
 * [SHARED] GET /api/users/login-request/:requestId - Poll approval status of pending login request
 * Used by Web and Mobile multi-device approval screen.
 */
router.get('/login-request/:requestId', userController.checkLoginRequestStatus);

// ==========================================
// [SHARED] & [WEB] Login Approvals & Active Sessions
// ==========================================

/**
 * [SHARED] GET /api/users/login-requests/pending - Fetch list of pending login requests needing approval
 */
router.get('/login-requests/pending', authenticate, userController.getPendingLoginRequests);

/**
 * [SHARED] POST /api/users/login-requests/:requestId/approve - Approve pending login request
 */
router.post('/login-requests/:requestId/approve', authenticate, userController.approveLoginRequest);

/**
 * [SHARED] POST /api/users/login-requests/:requestId/reject - Reject pending login request
 */
router.post('/login-requests/:requestId/reject', authenticate, userController.rejectLoginRequest);

/**
 * [WEB] GET /api/users/online-users - List currently active online users (Admin)
 * Exclusively consumed by Web client admin header/dashboard.
 */
router.get('/online-users', authenticate, userController.getOnlineUsers);

// ==========================================
// [SHARED] Current User Profile & RBAC Refresh
// ==========================================

/**
 * [SHARED] GET /api/users/me - Get current authenticated user profile, permissions, and assigned stores
 */
router.get('/me', authenticate, userController.getCurrentUser);

// ==========================================
// [SHARED] Subuser Management Endpoints
// Consumed by both Web and Mobile subuser management
// ==========================================

/**
 * [SHARED] GET /api/users/subusers - List subusers created by current user
 */
router.get('/subusers', authenticate, requireCreateUserPermission, userController.getSubusers);

/**
 * [SHARED] POST /api/users/subusers - Create a new subuser
 */
router.post('/subusers', authenticate, requireCreateUserPermission, userController.createSubuser);

/**
 * [SHARED] PUT /api/users/subusers/:id - Update existing subuser
 */
router.put('/subusers/:id', authenticate, requireCreateUserPermission, userController.updateSubuser);

/**
 * [SHARED] DELETE /api/users/subusers/:id - Delete existing subuser
 */
router.delete('/subusers/:id', authenticate, requireCreateUserPermission, userController.deleteSubuser);

// ==========================================
// [SHARED] System User Management Endpoints
// Consumed by both Web and Mobile user administration
// ==========================================

/**
 * [SHARED] POST /api/users - Create new system user (Admin only)
 */
router.post('/', authenticate, requireAdmin, validate(userValidator.createUser), userController.createUser);

/**
 * [SHARED] GET /api/users - List system users with pagination and search
 */
router.get('/', authenticate, (req, res, next) => {
    if (req.user.role === 'Admin' || req.user.canCreateUser || (req.user.allowedPages && req.user.allowedPages.includes('/users'))) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied.' });
}, userController.getUsers);

/**
 * [SHARED] GET /api/users/:id - Get user profile details by ID
 */
router.get('/:id', authenticate, (req, res, next) => {
    if (req.user.role === 'Admin' || req.user.canCreateUser || (req.user.allowedPages && req.user.allowedPages.includes('/users'))) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied.' });
}, userController.getUserById);

/**
 * [SHARED] PUT /api/users/:id - Update user details, role, or store assignments (Admin only)
 */
router.put('/:id', authenticate, requireAdmin, validate(userValidator.updateUser), userController.updateUser);

/**
 * [SHARED] DELETE /api/users/:id - Delete system user (Admin only)
 */
router.delete('/:id', authenticate, requireAdmin, userController.deleteUser);

export default router;
