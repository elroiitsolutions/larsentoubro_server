import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { userValidator } from '../validators/user.validator.js';
import { authenticate, requireAdmin, requireCreateUserPermission } from '../middleware/auth.middleware.js';

const router = Router();

// Public login routes
router.post('/login', validate(userValidator.loginUser), userController.loginUser);
router.post('/guest-login', userController.guestLogin);
router.post('/logout', authenticate, userController.logoutUser);

// Realtime Events Stream (SSE)
router.get('/events', userController.streamRealtimeEvents);

// Public Login Request Status Check
router.get('/login-request/:requestId', userController.checkLoginRequestStatus);

// Login Approvals (Accessible by Admin and Parent Users)
router.get('/login-requests/pending', authenticate, userController.getPendingLoginRequests);
router.post('/login-requests/:requestId/approve', authenticate, userController.approveLoginRequest);
router.post('/login-requests/:requestId/reject', authenticate, userController.rejectLoginRequest);
router.get('/online-users', authenticate, userController.getOnlineUsers);

// Current user profile & RBAC refresh
router.get('/me', authenticate, userController.getCurrentUser);

// Subuser Management Endpoints (Admin & Users with Create User permission)
router.get('/subusers', authenticate, requireCreateUserPermission, userController.getSubusers);
router.post('/subusers', authenticate, requireCreateUserPermission, userController.createSubuser);
router.put('/subusers/:id', authenticate, requireCreateUserPermission, userController.updateSubuser);
router.delete('/subusers/:id', authenticate, requireCreateUserPermission, userController.deleteSubuser);

// User Management Endpoints
router.post('/', authenticate, requireAdmin, validate(userValidator.createUser), userController.createUser);
router.get('/', authenticate, (req, res, next) => {
    if (req.user.role === 'Admin' || req.user.canCreateUser || (req.user.allowedPages && req.user.allowedPages.includes('/users'))) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied.' });
}, userController.getUsers);
router.get('/:id', authenticate, (req, res, next) => {
    if (req.user.role === 'Admin' || req.user.canCreateUser || (req.user.allowedPages && req.user.allowedPages.includes('/users'))) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied.' });
}, userController.getUserById);
router.put('/:id', authenticate, requireAdmin, validate(userValidator.updateUser), userController.updateUser);
router.delete('/:id', authenticate, requireAdmin, userController.deleteUser);

export default router;
