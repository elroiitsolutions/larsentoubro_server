import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { userValidator } from '../validators/user.validator.js';

const router = Router();

router.post('/', validate(userValidator.createUser), userController.createUser);
router.get('/', userController.getUsers);
router.post('/login', validate(userValidator.loginUser), userController.loginUser);

export default router;
