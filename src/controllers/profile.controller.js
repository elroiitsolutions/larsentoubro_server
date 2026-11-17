import * as profileService from '../services/profile.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base and profile-type specific upload directories
const uploadsDir = path.join(__dirname, '../../uploads/profile-documents');
const vendorUploadsDir = path.join(uploadsDir, 'vendor-documents');
const scrapDealerUploadsDir = path.join(uploadsDir, 'scrap-dealer-documents');
const supplierUploadsDir = path.join(uploadsDir, 'supplier-documents');

// Ensure all upload directories exist
[uploadsDir, vendorUploadsDir, scrapDealerUploadsDir, supplierUploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * Resolves the destination directory based on the profile type
 */
export const getProfileUploadDir = (profileType) => {
    const normalized = (profileType || '').toLowerCase();
    if (normalized.includes('vendor') || normalized === 'subcontractor') {
        return vendorUploadsDir;
    }
    if (normalized.includes('scrap') || normalized === 'scrapdealer') {
        return scrapDealerUploadsDir;
    }
    if (normalized.includes('supplier')) {
        return supplierUploadsDir;
    }
    return uploadsDir;
};

/**
 * Pre-upload middleware to resolve profileType by looking up the profile before Multer writes to disk
 */
export const resolveProfileUploadDir = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (id && !req.profileType) {
            const profile = await profileService.getProfileById(id);
            if (profile) {
                req.profileType = profile.profileType;
            }
        }
        next();
    } catch (err) {
        next(err);
    }
};

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.profileType || req.query?.profileType || req.query?.type || req.body?.profileType;
        const targetDir = getProfileUploadDir(type);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${nameWithoutExt}_${uniqueSuffix}${ext}`);
    }
});

/**
 * [WEB] Profile Document Upload Multer Configuration
 * Exclusively consumed by Web Application document attachment forms.
 */
export const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max file size limit
    fileFilter: (req, file, cb) => {
        // Accept images, pdfs, office docs
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|csv|zip/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.includes('pdf') || file.mimetype.includes('document') || file.mimetype.includes('sheet') || file.mimetype.includes('image');
        if (extname || mimetype) {
            return cb(null, true);
        }
        cb(new Error('Invalid file format. Allowed formats: PDF, Images, Word, Excel, ZIP'));
    }
});

/**
 * [SHARED] Profile Directory Controller
 * Core directory endpoints used by both Web and Mobile; document endpoints used by Web.
 */

/**
 * [SHARED] getProfiles - List subcontractor, vendor, and team profiles
 */
export const getProfiles = async (req, res, next) => {
    try {
        const result = await profileService.getProfiles(req.query, req.user);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] getProfileById - Fetch profile details and metrics
 */
export const getProfileById = async (req, res, next) => {
    try {
        const profile = await profileService.getProfileById(req.params.id, req.user);
        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] createProfile - Create a new profile entry
 */
export const createProfile = async (req, res, next) => {
    try {
        const profile = await profileService.createProfile(req.body, req.user);
        res.status(201).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] updateProfile - Update existing profile entry
 */
export const updateProfile = async (req, res, next) => {
    try {
        const profile = await profileService.updateProfile(req.params.id, req.body, req.user);
        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

/**
 * [SHARED] deleteProfile - Delete profile entry
 */
export const deleteProfile = async (req, res, next) => {
    try {
        const profile = await profileService.deleteProfile(req.params.id, req.user);
        res.status(200).json({ success: true, message: 'Profile deleted successfully', data: profile });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] uploadDocument - Attach file document to profile
 * Exclusively used by Web profile manager UI.
 */
export const uploadDocument = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileUrl = `/api/profiles/documents/file/${file.filename}`;

        const docData = {
            title: title || file.originalname,
            documentType: documentType || 'Other',
            fileName: file.filename,
            originalName: file.originalname,
            fileUrl,
            filePath: file.path,
            fileType: file.mimetype,
            fileSize: file.size,
            uploadedAt: new Date(),
            uploadedBy: req.user ? (req.user.name || req.user.email) : 'System Admin'
        };

        const updatedProfile = await profileService.addDocument(id, docData);
        res.status(200).json({ success: true, message: 'Document uploaded successfully', data: updatedProfile });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] deleteDocument - Remove attached file document from profile
 * Exclusively used by Web profile manager UI.
 */
export const deleteDocument = async (req, res, next) => {
    try {
        const { id, docId } = req.params;
        const profile = await profileService.getProfileById(id);

        const targetDoc = profile.documents.find(d => d._id.toString() === docId.toString());
        if (targetDoc) {
            if (targetDoc.filePath && fs.existsSync(targetDoc.filePath)) {
                try {
                    fs.unlinkSync(targetDoc.filePath);
                } catch (fsErr) {
                    console.error("Error removing file from disk:", fsErr);
                }
            } else if (targetDoc.fileName) {
                // Search candidate directories
                const candidatePaths = [
                    path.join(vendorUploadsDir, targetDoc.fileName),
                    path.join(scrapDealerUploadsDir, targetDoc.fileName),
                    path.join(supplierUploadsDir, targetDoc.fileName),
                    path.join(uploadsDir, targetDoc.fileName)
                ];
                for (const candidate of candidatePaths) {
                    if (fs.existsSync(candidate)) {
                        try {
                            fs.unlinkSync(candidate);
                            break;
                        } catch (fsErr) {
                            console.error("Error removing file from disk:", fsErr);
                        }
                    }
                }
            }
        }

        const updatedProfile = await profileService.deleteDocument(id, docId);
        res.status(200).json({ success: true, message: 'Document deleted successfully', data: updatedProfile });
    } catch (error) {
        next(error);
    }
};

/**
 * [WEB] downloadDocumentFile - Serve uploaded document binary from disk
 * Searches across type-specific folders (vendor-documents, scrap-dealer-documents, supplier-documents)
 * and falls back to root profile-documents for full backward compatibility.
 */
export const downloadDocumentFile = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const candidatePaths = [
            path.join(vendorUploadsDir, filename),
            path.join(scrapDealerUploadsDir, filename),
            path.join(supplierUploadsDir, filename),
            path.join(uploadsDir, filename)
        ];

        for (const candidate of candidatePaths) {
            if (fs.existsSync(candidate)) {
                return res.sendFile(candidate);
            }
        }

        return res.status(404).json({ success: false, message: 'File not found on server' });
    } catch (error) {
        next(error);
    }
};
