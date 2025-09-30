import { Router } from 'express';
import {
  createVendor,
  getVendorById,
  getVendors,
  updateVendor,
  deleteVendor,
  getVendorStats,
  getVendorPaymentHistory,
} from '../controllers/vendor.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateZod } from '../middleware/validation.middleware';
import { checkResourceAccess, checkResourceOwnership } from '../middleware/resource-permission.middleware';
import { UserRole } from '../types/enums';
import {
  createVendorSchema,
  updateVendorSchema,
  getVendorsFiltersSchema,
} from '../validators/vendor.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors:
 *   post:
 *     summary: Create a new vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorNumber
 *               - businessId
 *               - category
 *             properties:
 *               vendorNumber:
 *                 type: string
 *               businessId:
 *                 type: string
 *               category:
 *                 type: string
 *               paymentTerms:
 *                 type: number
 *               taxNumber:
 *                 type: string
 *               preferredPaymentMethod:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vendor created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  validateZod(createVendorSchema),
  createVendor
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors:
 *   get:
 *     summary: Get all vendors
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of vendors
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  validateZod(getVendorsFiltersSchema, 'query'),
  getVendors
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors/{vendorId}:
 *   get:
 *     summary: Get vendor by ID
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor details
 *       404:
 *         description: Vendor not found
 */
router.get(
  '/:vendorId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  checkResourceAccess('vendor', 'vendorId'),
  getVendorById
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors/{vendorId}:
 *   put:
 *     summary: Update vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *       404:
 *         description: Vendor not found
 */
router.put(
  '/:vendorId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('vendor', 'vendorId'),
  validateZod(updateVendorSchema),
  updateVendor
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors/{vendorId}:
 *   delete:
 *     summary: Delete vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *       400:
 *         description: Cannot delete vendor with existing records
 *       404:
 *         description: Vendor not found
 */
router.delete(
  '/:vendorId',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('vendor', 'vendorId'),
  deleteVendor
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors/{vendorId}/stats:
 *   get:
 *     summary: Get vendor statistics
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor statistics
 *       404:
 *         description: Vendor not found
 */
router.get(
  '/:vendorId/stats',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('vendor', 'vendorId'),
  getVendorStats
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/vendors/{vendorId}/payments:
 *   get:
 *     summary: Get vendor payment history
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Payment history
 *       404:
 *         description: Vendor not found
 */
router.get(
  '/:vendorId/payments',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('vendor', 'vendorId'),
  getVendorPaymentHistory
);

export default router;