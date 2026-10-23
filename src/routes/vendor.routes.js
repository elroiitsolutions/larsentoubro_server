import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller.js';

const router = Router();

/**
 * [WEB] Vendor / Subcontractor Management Routes
 * Exclusively consumed by Web Application (client/src/services/vendor.service.ts).
 * Not consumed by Mobile App.
 */

/**
 * [WEB] GET /api/vendors - List vendors with pagination and filtering
 */
router.get('/', vendorController.getVendors);

/**
 * [WEB] GET /api/vendors/:id - Get vendor details by ID
 */
router.get('/:id', vendorController.getVendorById);

/**
 * [WEB] POST /api/vendors - Create a new vendor profile
 */
router.post('/', vendorController.createVendor);

/**
 * [WEB] PUT /api/vendors/:id - Update existing vendor details
 */
router.put('/:id', vendorController.updateVendor);

/**
 * [WEB] DELETE /api/vendors/:id - Delete a vendor profile
 */
router.delete('/:id', vendorController.deleteVendor);

export default router;
