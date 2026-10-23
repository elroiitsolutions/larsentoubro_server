import { Router } from 'express';
import { createForm, getForms, getFormBySlug, submitForm } from '../controllers/form.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * [SHARED] Dynamic Form Engine Routes
 * Consumed by both Web Application and Mobile App:
 * - Web: client/src/services/form.service.ts
 * - Mobile: larsentoubro-app/src/services/formService.ts
 */

/**
 * [SHARED] GET /api/forms - List all dynamic form definitions
 */
router.get('/', getForms);

/**
 * [SHARED] POST /api/forms - Create/publish a new dynamic form definition (Admin only)
 */
router.post('/', authenticate, requireAdmin, createForm);

/**
 * [SHARED] GET /api/forms/:slug - Fetch form schema/fields by form slug
 */
router.get('/:slug', getFormBySlug);

/**
 * [SHARED] POST /api/forms/:slug/submit - Submit entry against a dynamic form
 */
router.post('/:slug/submit', submitForm);

export default router;
