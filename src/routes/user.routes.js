import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { userValidator } from '../validators/user.validator.js';
import { authenticate, requireAdmin, requirePagePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Public login route
router.post('/login', validate(userValidator.loginUser), userController.loginUser);

// Realtime Events Stream (SSE)
router.get('/events', userController.streamRealtimeEvents);

// Public Login Request Status Check
router.get('/login-request/:requestId', userController.checkLoginRequestStatus);

// Admin Approval System endpoints
router.get('/login-requests/pending', authenticate, requireAdmin, userController.getPendingLoginRequests);
router.post('/login-requests/:requestId/approve', authenticate, requireAdmin, userController.approveLoginRequest);
router.post('/login-requests/:requestId/reject', authenticate, requireAdmin, userController.rejectLoginRequest);
router.get('/online-users', authenticate, requireAdmin, userController.getOnlineUsers);

// Current user profile & RBAC refresh
router.get('/me', authenticate, userController.getCurrentUser);

// Admin-managed User endpoints (RBAC assignment & management)
router.post('/', authenticate, requireAdmin, validate(userValidator.createUser), userController.createUser);
router.get('/', authenticate, requirePagePermission("/users"), userController.getUsers);
router.get('/:id', authenticate, requirePagePermission("/users"), userController.getUserById);
router.put('/:id', authenticate, requireAdmin, validate(userValidator.updateUser), userController.updateUser);
router.delete('/:id', authenticate, requireAdmin, userController.deleteUser);

export default router;
