import express from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { authenticate, requirePagePermission } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * [WEB] GET /api/profiles/documents/file/:filename
 * Serves uploaded profile document files (PDF/images).
 * Exclusively consumed by Web Application profile browser.
 */
router.get('/documents/file/:filename', profileController.downloadDocumentFile);

// All other profile routes require authentication
router.use(authenticate);

/**
 * [SHARED] Profile Directory Management Routes
 * Consumed by both Web Application and Mobile App:
 * - Web: client/src/services/profile.service.ts
 * - Mobile: larsentoubro-app/src/features/profiles/services/profileService.ts
 */

/**
 * [SHARED] GET /api/profiles - List profiles with role/type filtering
 */
router.get('/', profileController.getProfiles);

/**
 * [SHARED] GET /api/profiles/:id - Get profile details by ID
 */
router.get('/:id', profileController.getProfileById);

/**
 * [SHARED] POST /api/profiles - Create a new profile
 */
router.post('/', requirePagePermission('/profiles'), profileController.createProfile);

/**
 * [SHARED] PUT /api/profiles/:id - Update existing profile
 */
router.put('/:id', requirePagePermission('/profiles'), profileController.updateProfile);

/**
 * [SHARED] DELETE /api/profiles/:id - Delete profile by ID
 */
router.delete('/:id', requirePagePermission('/profiles'), profileController.deleteProfile);

/**
 * [WEB] POST /api/profiles/:id/documents - Upload document attachments to profile
 * Exclusively used by Web profile manager UI.
 */
router.post('/:id/documents', requirePagePermission('/profiles'), profileController.upload.single('file'), profileController.uploadDocument);

/**
 * [WEB] DELETE /api/profiles/:id/documents/:docId - Remove document attachment from profile
 * Exclusively used by Web profile manager UI.
 */
router.delete('/:id/documents/:docId', requirePagePermission('/profiles'), profileController.deleteDocument);

export default router;
