import { Router } from 'express';
import userRoutes from './user.routes.js';
import formRoutes from './form.routes.js';

const router = Router();

router.use('/users', userRoutes);
router.use('/forms', formRoutes);

export default router;
