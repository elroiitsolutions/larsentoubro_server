import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { userValidator } from '../validators/user.validator.js';
import { authenticate, requireAdmin, requirePagePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Public login route
router.post('/login', validate(userValidator.loginUser), userController.loginUser);

// Current user profile & RBAC refresh
router.get('/me', authenticate, userController.getCurrentUser);

// Admin-managed User endpoints (RBAC assignment & management)
router.post('/', authenticate, requireAdmin, validate(userValidator.createUser), userController.createUser);
router.get('/', authenticate, requirePagePermission("/users"), userController.getUsers);
router.get('/:id', authenticate, requirePagePermission("/users"), userController.getUserById);
router.put('/:id', authenticate, requireAdmin, validate(userValidator.updateUser), userController.updateUser);
router.delete('/:id', authenticate, requireAdmin, userController.deleteUser);

export default router;
