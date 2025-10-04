import { Router } from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
  updatePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrderStats,
  receiveItems,
  closePurchaseOrder,
} from '../controllers/purchase-order.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateZod } from '../middleware/validation.middleware';
import { checkResourceAccess } from '../middleware/resource-permission.middleware';
import { UserRole } from '../types/enums';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  getPurchaseOrdersFiltersSchema,
  receiveItemsSchema,
} from '../validators/purchase-order.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/stats:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: Get purchase order statistics
 *     description: Retrieves comprehensive statistics for purchase orders including totals, status breakdown, vendor analysis, and spending metrics. Requires Accountant+ role.
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
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics period
 *         example: "2024-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics period
 *         example: "2024-12-31"
 *     responses:
 *       200:
 *         description: Purchase order statistics retrieved successfully
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
 *                     totalPurchaseOrders:
 *                       type: integer
 *                       example: 245
 *                     totalValue:
 *                       type: number
 *                       format: float
 *                       example: 156750.50
 *                     statusBreakdown:
 *                       type: object
 *                       properties:
 *                         DRAFT:
 *                           type: integer
 *                         PENDING_APPROVAL:
 *                           type: integer
 *                         APPROVED:
 *                           type: integer
 *                         ORDERED:
 *                           type: integer
 *                         PARTIALLY_RECEIVED:
 *                           type: integer
 *                         RECEIVED:
 *                           type: integer
 *                         CLOSED:
 *                           type: integer
 *                         CANCELLED:
 *                           type: integer
 *                     topVendors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vendorId:
 *                             type: string
 *                           vendorName:
 *                             type: string
 *                           totalOrders:
 *                             type: integer
 *                           totalValue:
 *                             type: number
 *                             format: float
 *                     averageOrderValue:
 *                       type: number
 *                       format: float
 *                       example: 639.59
 *                     pendingApprovals:
 *                       type: integer
 *                       example: 12
 *                     overdueReceipts:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
// Statistics endpoint must come before /:purchaseOrderId to avoid route collision
router.get(
  '/stats',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getPurchaseOrderStats
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Create a new purchase order
 *     description: Creates a new purchase order for purchasing inventory or services from a vendor. Supports multi-line items with pricing and delivery details. Requires Accountant+ role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorId
 *               - items
 *             properties:
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID
 *                 example: "vnd_1234567890"
 *               purchaseOrderNumber:
 *                 type: string
 *                 description: Custom PO number (auto-generated if not provided)
 *                 example: "PO-2024-001"
 *               orderDate:
 *                 type: string
 *                 format: date
 *                 description: Order date (defaults to today)
 *                 example: "2024-01-15"
 *               expectedDeliveryDate:
 *                 type: string
 *                 format: date
 *                 description: Expected delivery date
 *                 example: "2024-01-30"
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PENDING_APPROVAL, APPROVED, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED]
 *                 default: DRAFT
 *                 example: "DRAFT"
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *                 default: MEDIUM
 *                 example: "HIGH"
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - description
 *                     - quantity
 *                     - unitPrice
 *                   properties:
 *                     inventoryItemId:
 *                       type: string
 *                       description: Inventory item ID (if applicable)
 *                     description:
 *                       type: string
 *                       description: Item description
 *                       example: "Office Supplies - Printer Paper A4"
 *                     quantity:
 *                       type: number
 *                       format: float
 *                       minimum: 0.01
 *                       example: 50
 *                     unit:
 *                       type: string
 *                       example: "reams"
 *                     unitPrice:
 *                       type: number
 *                       format: float
 *                       minimum: 0
 *                       example: 25.99
 *                     taxRate:
 *                       type: number
 *                       format: float
 *                       minimum: 0
 *                       maximum: 100
 *                       example: 13
 *                     notes:
 *                       type: string
 *                       maxLength: 500
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   addressLine1:
 *                     type: string
 *                   addressLine2:
 *                     type: string
 *                   city:
 *                     type: string
 *                   province:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   country:
 *                     type: string
 *               shippingMethod:
 *                 type: string
 *                 example: "Standard Shipping"
 *               shippingCost:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 example: 15.00
 *               paymentTerms:
 *                 type: string
 *                 example: "Net 30"
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Internal notes about the purchase order
 *               approverIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: User IDs who need to approve this PO
 *     responses:
 *       201:
 *         description: Purchase order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     purchaseOrderNumber:
 *                       type: string
 *                     vendorId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     totalAmount:
 *                       type: number
 *                       format: float
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
 *         description: Vendor not found
 *       422:
 *         description: Business rule violation
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  validateZod(createPurchaseOrderSchema),
  createPurchaseOrder
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: List purchase orders
 *     description: Retrieves a paginated list of purchase orders with filtering and search capabilities. Supports filtering by vendor, status, priority, and date range. Requires Employee+ role.
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
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING_APPROVAL, APPROVED, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED]
 *         description: Filter by status
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *         description: Filter by priority level
 *       - in: query
 *         name: orderDateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by order date start
 *       - in: query
 *         name: orderDateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by order date end
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in PO number, vendor name, or item descriptions
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
 *         description: Purchase orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       purchaseOrderNumber:
 *                         type: string
 *                       vendor:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           businessId:
 *                             type: string
 *                       status:
 *                         type: string
 *                       priority:
 *                         type: string
 *                       orderDate:
 *                         type: string
 *                         format: date
 *                       expectedDeliveryDate:
 *                         type: string
 *                         format: date
 *                       totalAmount:
 *                         type: number
 *                         format: float
 *                       itemCount:
 *                         type: integer
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
  validateZod(getPurchaseOrdersFiltersSchema, 'query'),
  getPurchaseOrders
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: Get purchase order details
 *     description: Retrieves complete details for a specific purchase order including all line items, vendor information, approval history, and receipt status. Requires Employee+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *           example: "po_1234567890"
 *     responses:
 *       200:
 *         description: Purchase order details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     purchaseOrderNumber:
 *                       type: string
 *                     vendor:
 *                       type: object
 *                       description: Complete vendor details
 *                     status:
 *                       type: string
 *                     priority:
 *                       type: string
 *                     orderDate:
 *                       type: string
 *                       format: date
 *                     expectedDeliveryDate:
 *                       type: string
 *                       format: date
 *                     actualDeliveryDate:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           description:
 *                             type: string
 *                           quantity:
 *                             type: number
 *                             format: float
 *                           receivedQuantity:
 *                             type: number
 *                             format: float
 *                           unitPrice:
 *                             type: number
 *                             format: float
 *                           taxRate:
 *                             type: number
 *                             format: float
 *                           totalPrice:
 *                             type: number
 *                             format: float
 *                     subtotal:
 *                       type: number
 *                       format: float
 *                     taxAmount:
 *                       type: number
 *                       format: float
 *                     shippingCost:
 *                       type: number
 *                       format: float
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                     shippingAddress:
 *                       type: object
 *                     approvals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           approverId:
 *                             type: string
 *                           approverName:
 *                             type: string
 *                           status:
 *                             type: string
 *                           approvedAt:
 *                             type: string
 *                             format: date-time
 *                     receipts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           receivedDate:
 *                             type: string
 *                             format: date-time
 *                           receivedBy:
 *                             type: string
 *                           notes:
 *                             type: string
 *                     createdBy:
 *                       type: object
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
 *         description: Purchase order not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:purchaseOrderId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  getPurchaseOrderById
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}:
 *   put:
 *     tags: [Purchase Orders]
 *     summary: Update purchase order
 *     description: Updates an existing purchase order. Only DRAFT and PENDING_APPROVAL purchase orders can be fully updated. Once approved or ordered, only limited fields can be modified. Requires Accountant+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expectedDeliveryDate:
 *                 type: string
 *                 format: date
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *               items:
 *                 type: array
 *                 description: Line items (only editable for DRAFT/PENDING_APPROVAL)
 *               shippingAddress:
 *                 type: object
 *               shippingMethod:
 *                 type: string
 *               shippingCost:
 *                 type: number
 *                 format: float
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Purchase order updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Updated purchase order
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Conflict - PO cannot be updated in current status
 *       422:
 *         description: Business rule violation
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:purchaseOrderId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  validateZod(updatePurchaseOrderSchema),
  updatePurchaseOrder
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/approve:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Approve purchase order
 *     description: Approves a purchase order and changes status to APPROVED. If the PO requires multiple approvals, records this approval and checks if all required approvals are complete. Requires Manager+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               approvalNotes:
 *                 type: string
 *                 description: Optional notes for this approval
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Purchase order approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Purchase order approved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "APPROVED"
 *                     fullyApproved:
 *                       type: boolean
 *                       description: Whether all required approvals are complete
 *                     approvals:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions or not an assigned approver
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Conflict - PO not in PENDING_APPROVAL status
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:purchaseOrderId/approve',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  approvePurchaseOrder
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/receive:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Receive items from purchase order
 *     description: Records receipt of items from a purchase order. Supports partial receipts by specifying quantities received per line item. Updates inventory levels and PO status. Requires Employee+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - receivedDate
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemId
 *                     - quantityReceived
 *                   properties:
 *                     itemId:
 *                       type: string
 *                       description: Purchase order line item ID
 *                     quantityReceived:
 *                       type: number
 *                       format: float
 *                       minimum: 0.01
 *                       description: Quantity received for this item
 *                       example: 45
 *                     condition:
 *                       type: string
 *                       enum: [GOOD, DAMAGED, DEFECTIVE]
 *                       default: GOOD
 *                       description: Condition of received items
 *                     notes:
 *                       type: string
 *                       maxLength: 500
 *                       description: Notes about this item receipt
 *               receivedDate:
 *                 type: string
 *                 format: date-time
 *                 description: Date and time items were received
 *                 example: "2024-01-30T14:30:00Z"
 *               receivedBy:
 *                 type: string
 *                 description: User ID who received the items (defaults to current user)
 *               receiptNumber:
 *                 type: string
 *                 description: Receipt or delivery note number
 *                 example: "DN-2024-001"
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 description: General notes about this receipt
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileName:
 *                       type: string
 *                     fileUrl:
 *                       type: string
 *                 description: Attachments like delivery notes or photos
 *     responses:
 *       200:
 *         description: Items received successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Items received successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     receiptId:
 *                       type: string
 *                     purchaseOrderId:
 *                       type: string
 *                     purchaseOrderStatus:
 *                       type: string
 *                       description: Updated PO status (PARTIALLY_RECEIVED or RECEIVED)
 *                     itemsReceived:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId:
 *                             type: string
 *                           quantityReceived:
 *                             type: number
 *                             format: float
 *                           previouslyReceived:
 *                             type: number
 *                             format: float
 *                           totalReceived:
 *                             type: number
 *                             format: float
 *                           quantityOrdered:
 *                             type: number
 *                             format: float
 *                           fullyReceived:
 *                             type: boolean
 *                     inventoryUpdates:
 *                       type: array
 *                       description: Inventory items that were updated
 *       400:
 *         description: Invalid input data or quantity exceeds ordered amount
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Conflict - PO not in receivable status
 *       422:
 *         description: Business rule violation
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:purchaseOrderId/receive',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  validateZod(receiveItemsSchema),
  receiveItems
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/close:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Close purchase order
 *     description: Closes a purchase order, marking it as complete. Used when all items have been received and no further action is needed, or to manually close a PO that won't be fully fulfilled. Requires Manager+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for closing (especially if closing early)
 *                 maxLength: 500
 *               forceClose:
 *                 type: boolean
 *                 default: false
 *                 description: Force close even if items are not fully received
 *     responses:
 *       200:
 *         description: Purchase order closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Purchase order closed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "CLOSED"
 *                     closedAt:
 *                       type: string
 *                       format: date-time
 *                     closedBy:
 *                       type: string
 *                     unreceived Items:
 *                       type: array
 *                       description: Items that were never received (if force closed)
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Conflict - PO cannot be closed in current status or has unreceived items
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:purchaseOrderId/close',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  closePurchaseOrder
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}/cancel:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Cancel purchase order
 *     description: Cancels a purchase order. Can only cancel POs that haven't been received or partially received. If items have been received, use close instead. Requires Manager+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for cancellation
 *                 minLength: 5
 *                 maxLength: 1000
 *                 example: "Vendor unable to fulfill order within required timeframe"
 *               notifyVendor:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send cancellation notification to vendor
 *     responses:
 *       200:
 *         description: Purchase order cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Purchase order cancelled successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "CANCELLED"
 *                     cancelledAt:
 *                       type: string
 *                       format: date-time
 *                     cancelledBy:
 *                       type: string
 *                     cancellationReason:
 *                       type: string
 *       400:
 *         description: Invalid request or missing cancellation reason
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Conflict - PO cannot be cancelled (already received items)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:purchaseOrderId/cancel',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  cancelPurchaseOrder
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/purchase-orders/{purchaseOrderId}:
 *   delete:
 *     tags: [Purchase Orders]
 *     summary: Delete purchase order
 *     description: Soft deletes a purchase order. Only DRAFT purchase orders can be deleted. For other statuses, use cancel instead. Requires Manager+ role.
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
 *         name: purchaseOrderId
 *         required: true
 *         description: Purchase Order ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Purchase order deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Purchase order deleted successfully"
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Conflict - Cannot delete non-draft purchase order
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:purchaseOrderId',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  deletePurchaseOrder
);

export default router;
