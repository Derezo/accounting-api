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
 *     tags: [Vendors]
 *     summary: Create a new vendor
 *     description: Creates a new vendor record for managing supplier relationships, purchase orders, and accounts payable. Supports multiple payment terms, tax tracking, and vendor rating system. Requires Accountant+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "org_1234567890"
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
 *                 description: Unique vendor identifier
 *                 example: "VND-2024-001"
 *               businessId:
 *                 type: string
 *                 description: Reference to business entity
 *                 example: "bus_1234567890"
 *               category:
 *                 type: string
 *                 description: Vendor category
 *                 enum: [SUPPLIES, SERVICES, INVENTORY, UTILITIES, PROFESSIONAL_SERVICES, EQUIPMENT, OTHER]
 *                 example: "SUPPLIES"
 *               paymentTerms:
 *                 type: number
 *                 description: Payment terms in days (e.g., 30 for Net 30)
 *                 minimum: 0
 *                 maximum: 365
 *                 default: 30
 *                 example: 30
 *               taxNumber:
 *                 type: string
 *                 description: Vendor tax ID or business number
 *                 example: "123456789RT0001"
 *               preferredPaymentMethod:
 *                 type: string
 *                 enum: [CHECK, EFT, WIRE_TRANSFER, ACH, CREDIT_CARD, E_TRANSFER]
 *                 default: "CHECK"
 *                 example: "EFT"
 *               creditLimit:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 description: Maximum credit limit for this vendor
 *                 example: 50000.00
 *               currency:
 *                 type: string
 *                 default: "CAD"
 *                 example: "CAD"
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Internal notes about the vendor
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether vendor is active
 *     responses:
 *       201:
 *         description: Vendor created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     vendorNumber:
 *                       type: string
 *                     businessId:
 *                       type: string
 *                     category:
 *                       type: string
 *                     paymentTerms:
 *                       type: number
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Business entity not found
 *       409:
 *         description: Conflict - Vendor number already exists
 *       500:
 *         description: Internal server error
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
 *     tags: [Vendors]
 *     summary: List all vendors
 *     description: Retrieves a paginated list of vendors with filtering and search capabilities. Supports filtering by category, active status, currency, and full-text search across vendor details. Requires Employee+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [SUPPLIES, SERVICES, INVENTORY, UTILITIES, PROFESSIONAL_SERVICES, EQUIPMENT, OTHER]
 *         description: Filter by vendor category
 *         example: "SUPPLIES"
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *         example: true
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter by currency
 *         example: "CAD"
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in vendor number, business name, or contact details
 *         example: "Office Supplies Inc"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor from previous response
 *     responses:
 *       200:
 *         description: List of vendors retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       vendorNumber:
 *                         type: string
 *                       business:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           legalName:
 *                             type: string
 *                           email:
 *                             type: string
 *                           phone:
 *                             type: string
 *                       category:
 *                         type: string
 *                       paymentTerms:
 *                         type: number
 *                       isActive:
 *                         type: boolean
 *                       rating:
 *                         type: number
 *                         format: float
 *                         description: Vendor performance rating (0-5)
 *                       totalPurchases:
 *                         type: number
 *                         format: float
 *                       outstandingBalance:
 *                         type: number
 *                         format: float
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     nextCursor:
 *                       type: string
 *                       nullable: true
 *                     hasMore:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
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
 *     tags: [Vendors]
 *     summary: Get vendor details
 *     description: Retrieves complete details for a specific vendor including business information, payment terms, contact details, performance metrics, and relationship history. Requires Employee+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         description: Vendor ID
 *         schema:
 *           type: string
 *           example: "vnd_1234567890"
 *     responses:
 *       200:
 *         description: Vendor details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     vendorNumber:
 *                       type: string
 *                     business:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         legalName:
 *                           type: string
 *                         tradeName:
 *                           type: string
 *                         email:
 *                           type: string
 *                         phone:
 *                           type: string
 *                         website:
 *                           type: string
 *                         addresses:
 *                           type: array
 *                           description: Business addresses
 *                     category:
 *                       type: string
 *                     paymentTerms:
 *                       type: number
 *                     taxNumber:
 *                       type: string
 *                     preferredPaymentMethod:
 *                       type: string
 *                     creditLimit:
 *                       type: number
 *                       format: float
 *                     currency:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     rating:
 *                       type: number
 *                       format: float
 *                       description: Performance rating (0-5)
 *                     notes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Vendor not found
 *       500:
 *         description: Internal server error
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
 *     tags: [Vendors]
 *     summary: Update vendor
 *     description: Updates an existing vendor's information including payment terms, contact details, rating, and active status. Cannot modify vendor if there are pending transactions. Requires Accountant+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         description: Vendor ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [SUPPLIES, SERVICES, INVENTORY, UTILITIES, PROFESSIONAL_SERVICES, EQUIPMENT, OTHER]
 *               paymentTerms:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 365
 *               taxNumber:
 *                 type: string
 *               preferredPaymentMethod:
 *                 type: string
 *                 enum: [CHECK, EFT, WIRE_TRANSFER, ACH, CREDIT_CARD, E_TRANSFER]
 *               creditLimit:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *               rating:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 maximum: 5
 *                 description: Vendor performance rating
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *               isActive:
 *                 type: boolean
 *                 description: Activate or deactivate vendor
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Updated vendor details
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Vendor not found
 *       409:
 *         description: Conflict - Cannot update vendor with pending transactions
 *       500:
 *         description: Internal server error
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
 *     tags: [Vendors]
 *     summary: Delete vendor (soft delete)
 *     description: Soft deletes a vendor record. Vendor can only be deleted if there are no active purchase orders, unpaid bills, or recent transactions. Historical data remains intact for audit purposes. Requires Manager+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         description: Vendor ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Vendor deleted successfully"
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Vendor not found
 *       409:
 *         description: Conflict - Cannot delete vendor with active purchase orders or unpaid bills
 *       500:
 *         description: Internal server error
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
 *     tags: [Vendors]
 *     summary: Get vendor performance statistics
 *     description: Retrieves comprehensive performance metrics for a vendor including total purchases, payment history, on-time delivery rate, average order value, purchase order counts, outstanding balance, and quality ratings. Requires Accountant+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         description: Vendor ID
 *         schema:
 *           type: string
 *           example: "vnd_1234567890"
 *     responses:
 *       200:
 *         description: Vendor statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendorId:
 *                       type: string
 *                     vendorNumber:
 *                       type: string
 *                     totalPurchases:
 *                       type: number
 *                       format: float
 *                       description: Total amount purchased from vendor
 *                       example: 125450.75
 *                     totalPurchaseOrders:
 *                       type: integer
 *                       description: Total number of purchase orders
 *                       example: 87
 *                     activePurchaseOrders:
 *                       type: integer
 *                       description: Number of active/pending purchase orders
 *                       example: 5
 *                     totalPayments:
 *                       type: number
 *                       format: float
 *                       description: Total amount paid to vendor
 *                       example: 120350.00
 *                     outstandingBalance:
 *                       type: number
 *                       format: float
 *                       description: Current amount owed to vendor
 *                       example: 5100.75
 *                     averageOrderValue:
 *                       type: number
 *                       format: float
 *                       example: 1441.97
 *                     onTimeDeliveryRate:
 *                       type: number
 *                       format: float
 *                       description: Percentage of on-time deliveries (0-100)
 *                       example: 94.5
 *                     averagePaymentDays:
 *                       type: number
 *                       format: float
 *                       description: Average days to payment
 *                       example: 32.5
 *                     qualityRating:
 *                       type: number
 *                       format: float
 *                       description: Overall quality rating (0-5)
 *                       example: 4.6
 *                     lastPurchaseDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date of last purchase order
 *                     lastPaymentDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date of last payment
 *                     relationshipDuration:
 *                       type: integer
 *                       description: Days since vendor creation
 *                       example: 548
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Vendor not found
 *       500:
 *         description: Internal server error
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
 *     tags: [Vendors]
 *     summary: Get vendor payment history
 *     description: Retrieves detailed payment history for a vendor including all payments, payment methods, amounts, dates, and related purchase orders or bills. Supports date range filtering and pagination. Requires Accountant+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: vendorId
 *         required: true
 *         description: Vendor ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for payment history
 *         example: "2024-01-01T00:00:00Z"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for payment history
 *         example: "2024-12-31T23:59:59Z"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of payments to return
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       paymentDate:
 *                         type: string
 *                         format: date-time
 *                       amount:
 *                         type: number
 *                         format: float
 *                       paymentMethod:
 *                         type: string
 *                         enum: [CHECK, EFT, WIRE_TRANSFER, ACH, CREDIT_CARD, E_TRANSFER]
 *                       referenceNumber:
 *                         type: string
 *                         description: Check number, wire reference, etc.
 *                       purchaseOrder:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           purchaseOrderNumber:
 *                             type: string
 *                       bill:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           billNumber:
 *                             type: string
 *                       notes:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [PENDING, PROCESSED, CLEARED, FAILED]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Vendor not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:vendorId/payments',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('vendor', 'vendorId'),
  getVendorPaymentHistory
);

export default router;
