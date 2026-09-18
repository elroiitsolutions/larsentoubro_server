import express from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// File serve route (public/authenticated)
router.get('/documents/file/:filename', profileController.downloadDocumentFile);

// All other profile routes require authentication
router.use(authenticate);

router.get('/', profileController.getProfiles);
router.get('/:id', profileController.getProfileById);
router.post('/', requireAdmin, profileController.createProfile);
router.put('/:id', requireAdmin, profileController.updateProfile);
router.delete('/:id', requireAdmin, profileController.deleteProfile);

// Document upload & deletion
router.post('/:id/documents', requireAdmin, profileController.upload.single('file'), profileController.uploadDocument);
router.delete('/:id/documents/:docId', requireAdmin, profileController.deleteDocument);

export default router;
