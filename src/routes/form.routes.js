import { Router } from 'express';
import { createForm, getForms, getFormBySlug, submitForm } from '../controllers/form.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', getForms);
router.post('/', authenticate, requireAdmin, createForm);
router.get('/:slug', getFormBySlug);
router.post('/:slug/submit', submitForm);

export default router;
