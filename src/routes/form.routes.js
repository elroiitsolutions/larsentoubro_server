import { Router } from 'express';
import { createForm, getForms, getFormBySlug, submitForm } from '../controllers/form.controller.js';

const router = Router();

router.get('/', getForms);
router.post('/', createForm);
router.get('/:slug', getFormBySlug);
router.post('/:slug/submit', submitForm);

export default router;
