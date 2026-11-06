import { Router } from 'express';
import guestUserController from '../controllers/guestUser.controller.js';
import { authenticate, requireCreateUserPermission } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication and permission to create/manage sub-users
router.use(authenticate);
router.use(requireCreateUserPermission);

// Expiry notifications (14th-day warnings)
router.get('/notifications', guestUserController.getExpiringNotifications);

// Guest User CRUD
router.post('/', guestUserController.createGuestUser);
router.get('/', guestUserController.getGuestUsers);
router.get('/:id', guestUserController.getGuestUserById);
router.put('/:id', guestUserController.updateGuestUser);
router.delete('/:id', guestUserController.deleteGuestUser);

// Extension actions
router.post('/:id/extend', guestUserController.extendGuestUser);
router.post('/:id/reject', guestUserController.rejectGuestUser);

export default router;

