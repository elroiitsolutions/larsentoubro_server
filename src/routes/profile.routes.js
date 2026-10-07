import express from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { authenticate, requirePagePermission } from '../middleware/auth.middleware.js';

const router = express.Router();

// File serve route (public/authenticated)
router.get('/documents/file/:filename', profileController.downloadDocumentFile);

// All other profile routes require authentication
router.use(authenticate);

router.get('/', profileController.getProfiles);
router.get('/:id', profileController.getProfileById);
router.post('/', requirePagePermission('/profiles'), profileController.createProfile);
router.put('/:id', requirePagePermission('/profiles'), profileController.updateProfile);
router.delete('/:id', requirePagePermission('/profiles'), profileController.deleteProfile);

// Document upload & deletion
router.post('/:id/documents', requirePagePermission('/profiles'), profileController.upload.single('file'), profileController.uploadDocument);
router.delete('/:id/documents/:docId', requirePagePermission('/profiles'), profileController.deleteDocument);

export default router;
