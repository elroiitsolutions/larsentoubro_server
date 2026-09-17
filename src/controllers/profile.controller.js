import * as profileService from '../services/profile.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, '../../uploads/profile-documents');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${nameWithoutExt}_${uniqueSuffix}${ext}`);
    }
});

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

export const getProfiles = async (req, res, next) => {
    try {
        const result = await profileService.getProfiles(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const getProfileById = async (req, res, next) => {
    try {
        const profile = await profileService.getProfileById(req.params.id);
        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

export const createProfile = async (req, res, next) => {
    try {
        const profile = await profileService.createProfile(req.body);
        res.status(201).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const profile = await profileService.updateProfile(req.params.id, req.body);
        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

export const deleteProfile = async (req, res, next) => {
    try {
        const profile = await profileService.deleteProfile(req.params.id);
        res.status(200).json({ success: true, message: 'Profile deleted successfully', data: profile });
    } catch (error) {
        next(error);
    }
};

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

export const deleteDocument = async (req, res, next) => {
    try {
        const { id, docId } = req.params;
        const profile = await profileService.getProfileById(id);

        const targetDoc = profile.documents.find(d => d._id.toString() === docId.toString());
        if (targetDoc && targetDoc.filePath && fs.existsSync(targetDoc.filePath)) {
            try {
                fs.unlinkSync(targetDoc.filePath);
            } catch (fsErr) {
                console.error("Error removing file from disk:", fsErr);
            }
        }

        const updatedProfile = await profileService.deleteDocument(id, docId);
        res.status(200).json({ success: true, message: 'Document deleted successfully', data: updatedProfile });
    } catch (error) {
        next(error);
    }
};

export const downloadDocumentFile = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadsDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        res.sendFile(filePath);
    } catch (error) {
        next(error);
    }
};
