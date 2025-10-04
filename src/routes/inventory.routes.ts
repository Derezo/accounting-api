import { Router } from 'express';
import {
  getInventoryItemById,
  getInventoryItems,
  updateInventoryItem,
  createInventoryTransaction,
  getInventoryTransactions,
  getInventoryValuation,
  getLowStockItems,
  performStockCount,
  createInventoryItem,
  adjustQuantity,
  transferInventory,
  deleteInventoryItem,
  getInventoryStats,
} from '../controllers/inventory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateZod } from '../middleware/validation.middleware';
import { checkResourceAccess } from '../middleware/resource-permission.middleware';
import { UserRole } from '../types/enums';
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  getInventoryItemsFiltersSchema,
  adjustQuantitySchema,
  transferInventorySchema,
} from '../validators/inventory.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/stats:
 *   get:
 *     tags: [Inventory]
 *     summary: Get inventory statistics
 *     description: Retrieves comprehensive statistics for inventory including total items, valuation by tracking method (FIFO/LIFO/Weighted Average), stock status breakdown, and category analysis. Requires Accountant+ role.
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
 *     responses:
 *       200:
 *         description: Inventory statistics retrieved successfully
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
 *                     totalItems:
 *                       type: integer
 *                       description: Total number of inventory items
 *                       example: 1250
 *                     totalValue:
 *                       type: number
 *                       format: float
 *                       description: Total inventory valuation across all items
 *                       example: 487250.75
 *                     totalQuantity:
 *                       type: integer
 *                       description: Total quantity across all items
 *                       example: 15430
 *                     statusBreakdown:
 *                       type: object
 *                       description: Breakdown by inventory status
 *                       properties:
 *                         ACTIVE:
 *                           type: integer
 *                           example: 1100
 *                         INACTIVE:
 *                           type: integer
 *                           example: 50
 *                         DISCONTINUED:
 *                           type: integer
 *                           example: 30
 *                         OUT_OF_STOCK:
 *                           type: integer
 *                           example: 45
 *                         LOW_STOCK:
 *                           type: integer
 *                           example: 25
 *                     itemTypeBreakdown:
 *                       type: object
 *                       description: Breakdown by item type
 *                       properties:
 *                         PRODUCT:
 *                           type: integer
 *                         SERVICE:
 *                           type: integer
 *                         RAW_MATERIAL:
 *                           type: integer
 *                         FINISHED_GOODS:
 *                           type: integer
 *                         WORK_IN_PROGRESS:
 *                           type: integer
 *                         SUPPLIES:
 *                           type: integer
 *                         TOOL:
 *                           type: integer
 *                         EQUIPMENT:
 *                           type: integer
 *                     trackingMethodBreakdown:
 *                       type: object
 *                       description: Breakdown by cost tracking method
 *                       properties:
 *                         FIFO:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                             value:
 *                               type: number
 *                         LIFO:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                             value:
 *                               type: number
 *                         WEIGHTED_AVERAGE:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                             value:
 *                               type: number
 *                         SPECIFIC_IDENTIFICATION:
 *                           type: object
 *                           properties:
 *                             count:
 *                               type: integer
 *                             value:
 *                               type: number
 *                     lowStockCount:
 *                       type: integer
 *                       description: Number of items below reorder point
 *                       example: 25
 *                     outOfStockCount:
 *                       type: integer
 *                       description: Number of items with zero quantity
 *                       example: 45
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "UNAUTHORIZED"
 *                     message:
 *                       type: string
 *                       example: "Invalid authentication token"
 *       403:
 *         description: Forbidden - Insufficient permissions (requires Accountant+ role)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     message:
 *                       type: string
 *                       example: "Insufficient permissions"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "INTERNAL_ERROR"
 *                     message:
 *                       type: string
 */
router.get(
  '/stats',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getInventoryStats
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/valuation:
 *   get:
 *     tags: [Inventory]
 *     summary: Get inventory valuation report
 *     description: |
 *       Generates detailed inventory valuation report using configured tracking methods (FIFO, LIFO, Weighted Average, Specific Identification).
 *       Provides total valuation, item-by-item breakdown, and location-based analysis. Essential for financial reporting and balance sheet preparation.
 *       Requires Accountant+ role.
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
 *         name: locationId
 *         schema:
 *           type: string
 *         description: Optional location ID to filter valuation by specific location
 *         example: "loc_warehouse_main"
 *     responses:
 *       200:
 *         description: Inventory valuation retrieved successfully
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
 *                     totalValuation:
 *                       type: number
 *                       format: float
 *                       description: Total inventory value across all items
 *                       example: 487250.75
 *                     totalCost:
 *                       type: number
 *                       format: float
 *                       description: Total cost basis
 *                       example: 365430.50
 *                     totalRetailValue:
 *                       type: number
 *                       format: float
 *                       description: Total retail value at unit prices
 *                       example: 652890.25
 *                     potentialMargin:
 *                       type: number
 *                       format: float
 *                       description: Difference between retail and cost
 *                       example: 287459.75
 *                     marginPercentage:
 *                       type: number
 *                       format: float
 *                       description: Margin as percentage
 *                       example: 44.2
 *                     itemBreakdown:
 *                       type: array
 *                       description: Detailed valuation per inventory item
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId:
 *                             type: string
 *                           itemCode:
 *                             type: string
 *                           name:
 *                             type: string
 *                           quantityOnHand:
 *                             type: number
 *                           unitCost:
 *                             type: number
 *                           unitPrice:
 *                             type: number
 *                           totalCost:
 *                             type: number
 *                           totalRetailValue:
 *                             type: number
 *                           trackingMethod:
 *                             type: string
 *                             enum: [FIFO, LIFO, WEIGHTED_AVERAGE, SPECIFIC_IDENTIFICATION]
 *                     locationBreakdown:
 *                       type: array
 *                       description: Valuation by location (if applicable)
 *                       items:
 *                         type: object
 *                         properties:
 *                           locationId:
 *                             type: string
 *                           locationName:
 *                             type: string
 *                           totalValue:
 *                             type: number
 *                           itemCount:
 *                             type: integer
 *                     asOfDate:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp of valuation calculation
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions (requires Accountant+ role)
 *       500:
 *         description: Internal server error
 */
router.get(
  '/valuation',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getInventoryValuation
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/low-stock:
 *   get:
 *     tags: [Inventory]
 *     summary: Get low stock alerts
 *     description: |
 *       Retrieves list of inventory items that are below their reorder points or out of stock.
 *       Critical for procurement planning and preventing stockouts. Items are sorted by urgency
 *       (out of stock first, then by how far below reorder point). Available to all authenticated users.
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
 *         name: locationId
 *         schema:
 *           type: string
 *         description: Optional location ID to filter alerts by specific location
 *         example: "loc_warehouse_main"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of items to return
 *         example: 25
 *     responses:
 *       200:
 *         description: Low stock items retrieved successfully
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
 *                         example: "inv_item_1234"
 *                       itemCode:
 *                         type: string
 *                         example: "SKU-12345"
 *                       name:
 *                         type: string
 *                         example: "Premium Widget Set"
 *                       quantityOnHand:
 *                         type: number
 *                         example: 15
 *                       reorderPoint:
 *                         type: number
 *                         example: 50
 *                       reorderQuantity:
 *                         type: number
 *                         example: 100
 *                       shortfall:
 *                         type: number
 *                         description: How much below reorder point
 *                         example: 35
 *                       status:
 *                         type: string
 *                         enum: [ACTIVE, INACTIVE, DISCONTINUED, OUT_OF_STOCK, LOW_STOCK]
 *                         example: "LOW_STOCK"
 *                       vendorId:
 *                         type: string
 *                         nullable: true
 *                       unitCost:
 *                         type: number
 *                         example: 45.99
 *                       lastRestockDate:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  '/low-stock',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getLowStockItems
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/transactions:
 *   get:
 *     tags: [Inventory]
 *     summary: Get inventory transactions
 *     description: |
 *       Retrieves paginated list of all inventory transactions (purchases, sales, adjustments, transfers, etc.).
 *       Provides complete audit trail of all inventory movements. Supports filtering by item, date range, and transaction type.
 *       Available to all authenticated users.
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
 *         name: inventoryItemId
 *         schema:
 *           type: string
 *         description: Filter by specific inventory item
 *         example: "inv_item_1234"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [PURCHASE, SALE, RETURN, DAMAGE, LOSS, THEFT, EXPIRED, DONATION, TRANSFER, COUNT_ADJUSTMENT, MANUFACTURING, OTHER]
 *         description: Filter by transaction type
 *         example: "PURCHASE"
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for transaction range
 *         example: "2024-01-01"
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for transaction range
 *         example: "2024-12-31"
 *       - in: query
 *         name: referenceType
 *         schema:
 *           type: string
 *         description: Filter by reference document type (e.g., "PurchaseOrder", "SalesOrder")
 *         example: "PurchaseOrder"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of transactions per page
 *         example: 25
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor from previous response
 *     responses:
 *       200:
 *         description: Inventory transactions retrieved successfully
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
 *                       inventoryItemId:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [PURCHASE, SALE, RETURN, DAMAGE, LOSS, THEFT, EXPIRED, DONATION, TRANSFER, COUNT_ADJUSTMENT, MANUFACTURING, OTHER]
 *                       quantity:
 *                         type: number
 *                       quantityBefore:
 *                         type: number
 *                       quantityAfter:
 *                         type: number
 *                       unitCost:
 *                         type: number
 *                       totalCost:
 *                         type: number
 *                       referenceType:
 *                         type: string
 *                         nullable: true
 *                       referenceId:
 *                         type: string
 *                         nullable: true
 *                       referenceNumber:
 *                         type: string
 *                         nullable: true
 *                       notes:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       createdBy:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     hasMore:
 *                       type: boolean
 *                       example: true
 *                     nextCursor:
 *                       type: string
 *                       example: "eyJpZCI6IjEyMzQ1IiwidGltZXN0YW1wIjoxNjk5MDAwMDAwfQ=="
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  '/transactions',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  getInventoryTransactions
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/transactions:
 *   post:
 *     tags: [Inventory]
 *     summary: Create inventory transaction
 *     description: |
 *       Manually creates an inventory transaction to record stock movements.
 *       Used for adjustments, transfers, losses, and other non-automated inventory changes.
 *       Automatically updates item quantities and creates audit trail. Available to all authenticated users.
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
 *               - inventoryItemId
 *               - type
 *               - quantity
 *             properties:
 *               inventoryItemId:
 *                 type: string
 *                 description: ID of the inventory item
 *                 example: "inv_item_1234"
 *               type:
 *                 type: string
 *                 enum: [PURCHASE, SALE, RETURN, DAMAGE, LOSS, THEFT, EXPIRED, DONATION, TRANSFER, COUNT_ADJUSTMENT, MANUFACTURING, OTHER]
 *                 description: Type of transaction
 *                 example: "COUNT_ADJUSTMENT"
 *               quantity:
 *                 type: number
 *                 description: Quantity change (positive for increases, negative for decreases)
 *                 example: -5
 *               unitCost:
 *                 type: number
 *                 description: Cost per unit (optional, uses item's unitCost if not provided)
 *                 example: 45.99
 *               referenceType:
 *                 type: string
 *                 description: Type of reference document (e.g., "PurchaseOrder", "SalesOrder")
 *                 example: "Manual Adjustment"
 *               referenceId:
 *                 type: string
 *                 description: ID of reference document
 *                 example: "adj_1234"
 *               referenceNumber:
 *                 type: string
 *                 description: Human-readable reference number
 *                 example: "ADJ-2024-001"
 *               notes:
 *                 type: string
 *                 description: Notes about the transaction
 *                 example: "Damaged during warehouse reorganization"
 *           examples:
 *             damageAdjustment:
 *               summary: Record damaged goods
 *               value:
 *                 inventoryItemId: "inv_item_1234"
 *                 type: "DAMAGE"
 *                 quantity: -10
 *                 notes: "Water damage in warehouse - boxes 15-25"
 *             stockCount:
 *               summary: Physical count adjustment
 *               value:
 *                 inventoryItemId: "inv_item_5678"
 *                 type: "COUNT_ADJUSTMENT"
 *                 quantity: 3
 *                 referenceNumber: "COUNT-2024-Q1"
 *                 notes: "Quarterly physical inventory count - found 3 additional units"
 *     responses:
 *       201:
 *         description: Inventory transaction created successfully
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
 *                     inventoryItemId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     quantityBefore:
 *                       type: number
 *                     quantityAfter:
 *                       type: number
 *                     unitCost:
 *                       type: number
 *                     totalCost:
 *                       type: number
 *                     referenceType:
 *                       type: string
 *                     referenceId:
 *                       type: string
 *                     referenceNumber:
 *                       type: string
 *                     notes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     createdBy:
 *                       type: string
 *       400:
 *         description: Bad request - Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Not found - Inventory item not found
 *       422:
 *         description: Unprocessable entity - Validation errors
 *       500:
 *         description: Internal server error
 */
router.post(
  '/transactions',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  createInventoryTransaction
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory:
 *   post:
 *     tags: [Inventory]
 *     summary: Create inventory item
 *     description: |
 *       Creates a new inventory item with complete tracking configuration. Supports multiple item types
 *       (products, services, raw materials, etc.), cost tracking methods (FIFO, LIFO, Weighted Average),
 *       and advanced features like serialization, batch tracking, and multi-location inventory.
 *       Requires Accountant+ role.
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
 *               - itemCode
 *               - name
 *               - itemType
 *             properties:
 *               itemCode:
 *                 type: string
 *                 description: Unique item code/SKU
 *                 maxLength: 50
 *                 example: "SKU-12345"
 *               name:
 *                 type: string
 *                 description: Item name
 *                 maxLength: 255
 *                 example: "Premium Widget Set"
 *               description:
 *                 type: string
 *                 description: Detailed item description
 *                 maxLength: 2000
 *                 example: "High-quality widget set with premium finish"
 *               itemType:
 *                 type: string
 *                 enum: [PRODUCT, SERVICE, RAW_MATERIAL, FINISHED_GOODS, WORK_IN_PROGRESS, SUPPLIES, TOOL, EQUIPMENT, OTHER]
 *                 description: Type of inventory item
 *                 example: "PRODUCT"
 *               trackingMethod:
 *                 type: string
 *                 enum: [FIFO, LIFO, WEIGHTED_AVERAGE, SPECIFIC_IDENTIFICATION]
 *                 description: Cost tracking method for valuation
 *                 default: "FIFO"
 *                 example: "FIFO"
 *               unitOfMeasure:
 *                 type: string
 *                 enum: [UNIT, EACH, PIECE, BOX, CASE, DOZEN, POUND, KILOGRAM, OUNCE, GRAM, LITER, MILLILITER, GALLON, QUART, PINT, CUP, METER, CENTIMETER, FOOT, INCH, SQUARE_FOOT, SQUARE_METER, HOUR, DAY, MONTH, YEAR]
 *                 description: Unit of measure
 *                 default: "UNIT"
 *                 example: "PIECE"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, DISCONTINUED, OUT_OF_STOCK, LOW_STOCK]
 *                 description: Item status
 *                 default: "ACTIVE"
 *                 example: "ACTIVE"
 *               sku:
 *                 type: string
 *                 description: Stock keeping unit
 *                 maxLength: 50
 *                 example: "WID-PREM-001"
 *               barcode:
 *                 type: string
 *                 description: Barcode/UPC
 *                 maxLength: 100
 *                 example: "123456789012"
 *               categoryId:
 *                 type: string
 *                 description: Category ID
 *                 example: "cat_widgets"
 *               vendorId:
 *                 type: string
 *                 description: Primary vendor ID
 *                 example: "ven_1234"
 *               assetAccountId:
 *                 type: string
 *                 description: Asset account for inventory value
 *                 example: "acc_1200"
 *               cogsAccountId:
 *                 type: string
 *                 description: Cost of goods sold account
 *                 example: "acc_5000"
 *               revenueAccountId:
 *                 type: string
 *                 description: Revenue account for sales
 *                 example: "acc_4000"
 *               quantityOnHand:
 *                 type: number
 *                 description: Initial quantity on hand
 *                 minimum: 0
 *                 default: 0
 *                 example: 100
 *               reorderPoint:
 *                 type: number
 *                 description: Minimum quantity before reorder alert
 *                 minimum: 0
 *                 example: 25
 *               reorderQuantity:
 *                 type: number
 *                 description: Suggested reorder quantity
 *                 minimum: 0
 *                 example: 100
 *               unitCost:
 *                 type: number
 *                 description: Cost per unit
 *                 minimum: 0
 *                 default: 0
 *                 example: 45.99
 *               unitPrice:
 *                 type: number
 *                 description: Selling price per unit
 *                 minimum: 0
 *                 default: 0
 *                 example: 79.99
 *               weight:
 *                 type: number
 *                 description: Item weight
 *                 minimum: 0
 *                 example: 2.5
 *               weightUnit:
 *                 type: string
 *                 enum: [KG, LB, G, OZ]
 *                 description: Weight unit
 *                 example: "LB"
 *               dimensions:
 *                 type: object
 *                 description: Physical dimensions
 *                 properties:
 *                   length:
 *                     type: number
 *                     minimum: 0
 *                   width:
 *                     type: number
 *                     minimum: 0
 *                   height:
 *                     type: number
 *                     minimum: 0
 *                   unit:
 *                     type: string
 *                     enum: [CM, IN, M, FT]
 *               isTracked:
 *                 type: boolean
 *                 description: Whether to track inventory quantities
 *                 default: true
 *                 example: true
 *               isSerialized:
 *                 type: boolean
 *                 description: Whether item uses serial number tracking
 *                 default: false
 *                 example: false
 *               isBatchTracked:
 *                 type: boolean
 *                 description: Whether item uses batch/lot tracking
 *                 default: false
 *                 example: false
 *               isTaxable:
 *                 type: boolean
 *                 description: Whether item is subject to tax
 *                 default: true
 *                 example: true
 *               taxRateId:
 *                 type: string
 *                 description: Applicable tax rate ID
 *                 example: "tax_gst"
 *               notes:
 *                 type: string
 *                 description: Internal notes
 *                 maxLength: 2000
 *               metadata:
 *                 type: object
 *                 description: Custom metadata
 *                 additionalProperties: true
 *           examples:
 *             product:
 *               summary: Standard product item
 *               value:
 *                 itemCode: "SKU-12345"
 *                 name: "Premium Widget Set"
 *                 description: "High-quality widget set with premium finish"
 *                 itemType: "PRODUCT"
 *                 trackingMethod: "FIFO"
 *                 unitOfMeasure: "PIECE"
 *                 status: "ACTIVE"
 *                 sku: "WID-PREM-001"
 *                 barcode: "123456789012"
 *                 quantityOnHand: 100
 *                 reorderPoint: 25
 *                 reorderQuantity: 100
 *                 unitCost: 45.99
 *                 unitPrice: 79.99
 *                 isTaxable: true
 *             serialized:
 *               summary: Serialized equipment
 *               value:
 *                 itemCode: "EQP-LAPTOP-001"
 *                 name: "Business Laptop - Model X1"
 *                 itemType: "EQUIPMENT"
 *                 trackingMethod: "SPECIFIC_IDENTIFICATION"
 *                 unitOfMeasure: "EACH"
 *                 isSerialized: true
 *                 unitCost: 1200.00
 *                 unitPrice: 1599.00
 *     responses:
 *       201:
 *         description: Inventory item created successfully
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
 *                     itemCode:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     itemType:
 *                       type: string
 *                     trackingMethod:
 *                       type: string
 *                     unitOfMeasure:
 *                       type: string
 *                     status:
 *                       type: string
 *                     quantityOnHand:
 *                       type: number
 *                     unitCost:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions (requires Accountant+ role)
 *       422:
 *         description: Unprocessable entity - Validation errors (e.g., duplicate itemCode)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  validateZod(createInventoryItemSchema),
  createInventoryItem
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: List inventory items
 *     description: |
 *       Retrieves paginated list of inventory items with advanced filtering options.
 *       Supports filtering by type, status, category, vendor, stock levels, and text search.
 *       Uses cursor-based pagination for efficient large dataset handling. Available to all authenticated users.
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
 *         name: itemType
 *         schema:
 *           type: string
 *           enum: [PRODUCT, SERVICE, RAW_MATERIAL, FINISHED_GOODS, WORK_IN_PROGRESS, SUPPLIES, TOOL, EQUIPMENT, OTHER]
 *         description: Filter by item type
 *         example: "PRODUCT"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, DISCONTINUED, OUT_OF_STOCK, LOW_STOCK]
 *         description: Filter by status
 *         example: "ACTIVE"
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by category
 *         example: "cat_widgets"
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor
 *         example: "ven_1234"
 *       - in: query
 *         name: lowStock
 *         schema:
 *           type: boolean
 *         description: Show only items below reorder point
 *         example: true
 *       - in: query
 *         name: outOfStock
 *         schema:
 *           type: boolean
 *         description: Show only items with zero quantity
 *         example: false
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Search by item code, name, SKU, or barcode
 *         example: "widget"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of items per page
 *         example: 25
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor from previous response
 *     responses:
 *       200:
 *         description: Inventory items retrieved successfully
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
 *                       itemCode:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       itemType:
 *                         type: string
 *                       trackingMethod:
 *                         type: string
 *                       unitOfMeasure:
 *                         type: string
 *                       status:
 *                         type: string
 *                       sku:
 *                         type: string
 *                       barcode:
 *                         type: string
 *                       quantityOnHand:
 *                         type: number
 *                       reorderPoint:
 *                         type: number
 *                       reorderQuantity:
 *                         type: number
 *                       unitCost:
 *                         type: number
 *                       unitPrice:
 *                         type: number
 *                       categoryId:
 *                         type: string
 *                       vendorId:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     hasMore:
 *                       type: boolean
 *                       example: true
 *                     nextCursor:
 *                       type: string
 *                       example: "eyJpZCI6IjEyMzQ1IiwidGltZXN0YW1wIjoxNjk5MDAwMDAwfQ=="
 *       400:
 *         description: Bad request - Invalid query parameters
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  validateZod(getInventoryItemsFiltersSchema, 'query'),
  getInventoryItems
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/{itemId}:
 *   get:
 *     tags: [Inventory]
 *     summary: Get inventory item details
 *     description: |
 *       Retrieves complete details for a specific inventory item including current quantities,
 *       cost information, tracking configuration, vendor details, and associated accounts.
 *       Available to all authenticated users with access to the organization.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Inventory item ID
 *         schema:
 *           type: string
 *           example: "inv_item_1234"
 *     responses:
 *       200:
 *         description: Inventory item retrieved successfully
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
 *                     organizationId:
 *                       type: string
 *                     itemCode:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     itemType:
 *                       type: string
 *                     trackingMethod:
 *                       type: string
 *                     unitOfMeasure:
 *                       type: string
 *                     status:
 *                       type: string
 *                     sku:
 *                       type: string
 *                     barcode:
 *                       type: string
 *                     categoryId:
 *                       type: string
 *                     vendorId:
 *                       type: string
 *                     assetAccountId:
 *                       type: string
 *                     cogsAccountId:
 *                       type: string
 *                     revenueAccountId:
 *                       type: string
 *                     quantityOnHand:
 *                       type: number
 *                     reorderPoint:
 *                       type: number
 *                     reorderQuantity:
 *                       type: number
 *                     unitCost:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     weight:
 *                       type: number
 *                     weightUnit:
 *                       type: string
 *                     dimensions:
 *                       type: object
 *                     isTracked:
 *                       type: boolean
 *                     isSerialized:
 *                       type: boolean
 *                     isBatchTracked:
 *                       type: boolean
 *                     isTaxable:
 *                       type: boolean
 *                     taxRateId:
 *                       type: string
 *                     notes:
 *                       type: string
 *                     metadata:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     createdBy:
 *                       type: string
 *                     updatedBy:
 *                       type: string
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or resource access denied
 *       404:
 *         description: Not found - Inventory item not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:itemId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  checkResourceAccess('inventory', 'itemId'),
  getInventoryItemById
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/{itemId}:
 *   put:
 *     tags: [Inventory]
 *     summary: Update inventory item
 *     description: |
 *       Updates an existing inventory item's properties. Supports partial updates - only provided fields
 *       will be modified. Note: To change quantities, use the adjust or transfer endpoints instead.
 *       Requires Accountant+ role. Creates audit trail entry.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Inventory item ID
 *         schema:
 *           type: string
 *           example: "inv_item_1234"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itemCode:
 *                 type: string
 *                 maxLength: 50
 *               name:
 *                 type: string
 *                 maxLength: 255
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               itemType:
 *                 type: string
 *                 enum: [PRODUCT, SERVICE, RAW_MATERIAL, FINISHED_GOODS, WORK_IN_PROGRESS, SUPPLIES, TOOL, EQUIPMENT, OTHER]
 *               trackingMethod:
 *                 type: string
 *                 enum: [FIFO, LIFO, WEIGHTED_AVERAGE, SPECIFIC_IDENTIFICATION]
 *               unitOfMeasure:
 *                 type: string
 *                 enum: [UNIT, EACH, PIECE, BOX, CASE, DOZEN, POUND, KILOGRAM, OUNCE, GRAM, LITER, MILLILITER, GALLON, QUART, PINT, CUP, METER, CENTIMETER, FOOT, INCH, SQUARE_FOOT, SQUARE_METER, HOUR, DAY, MONTH, YEAR]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, DISCONTINUED, OUT_OF_STOCK, LOW_STOCK]
 *               sku:
 *                 type: string
 *                 maxLength: 50
 *               barcode:
 *                 type: string
 *                 maxLength: 100
 *               categoryId:
 *                 type: string
 *               vendorId:
 *                 type: string
 *               assetAccountId:
 *                 type: string
 *               cogsAccountId:
 *                 type: string
 *               revenueAccountId:
 *                 type: string
 *               reorderPoint:
 *                 type: number
 *                 minimum: 0
 *               reorderQuantity:
 *                 type: number
 *                 minimum: 0
 *               unitCost:
 *                 type: number
 *                 minimum: 0
 *               unitPrice:
 *                 type: number
 *                 minimum: 0
 *               weight:
 *                 type: number
 *                 minimum: 0
 *               weightUnit:
 *                 type: string
 *                 enum: [KG, LB, G, OZ]
 *               dimensions:
 *                 type: object
 *                 properties:
 *                   length:
 *                     type: number
 *                   width:
 *                     type: number
 *                   height:
 *                     type: number
 *                   unit:
 *                     type: string
 *                     enum: [CM, IN, M, FT]
 *               isTracked:
 *                 type: boolean
 *               isSerialized:
 *                 type: boolean
 *               isBatchTracked:
 *                 type: boolean
 *               isTaxable:
 *                 type: boolean
 *               taxRateId:
 *                 type: string
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *               metadata:
 *                 type: object
 *           examples:
 *             priceUpdate:
 *               summary: Update pricing
 *               value:
 *                 unitCost: 48.99
 *                 unitPrice: 84.99
 *             statusChange:
 *               summary: Discontinue item
 *               value:
 *                 status: "DISCONTINUED"
 *                 notes: "Product line discontinued - replacing with new model"
 *     responses:
 *       200:
 *         description: Inventory item updated successfully
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
 *                   description: Updated inventory item (same structure as GET response)
 *       400:
 *         description: Bad request - Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or resource access denied
 *       404:
 *         description: Not found - Inventory item not found
 *       422:
 *         description: Unprocessable entity - Validation errors
 *       500:
 *         description: Internal server error
 */
router.put(
  '/:itemId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  validateZod(updateInventoryItemSchema),
  updateInventoryItem
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/{itemId}/adjust:
 *   post:
 *     tags: [Inventory]
 *     summary: Adjust inventory quantity
 *     description: |
 *       Manually adjusts inventory quantity for various reasons (damage, loss, theft, count adjustments, etc.).
 *       Creates an inventory transaction record and updates the item's quantity on hand.
 *       Essential for maintaining accurate inventory records. Available to all authenticated users.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Inventory item ID
 *         schema:
 *           type: string
 *           example: "inv_item_1234"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *               - reason
 *             properties:
 *               quantity:
 *                 type: integer
 *                 description: Quantity adjustment (positive to add, negative to subtract)
 *                 example: -5
 *               reason:
 *                 type: string
 *                 enum: [PURCHASE, SALE, RETURN, DAMAGE, LOSS, THEFT, EXPIRED, DONATION, TRANSFER, COUNT_ADJUSTMENT, MANUFACTURING, OTHER]
 *                 description: Reason for adjustment
 *                 example: "DAMAGE"
 *               referenceNumber:
 *                 type: string
 *                 maxLength: 100
 *                 description: Reference number or document ID
 *                 example: "ADJ-2024-001"
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Detailed notes about the adjustment
 *                 example: "Water damage during warehouse reorganization - boxes 15-25 affected"
 *               unitCost:
 *                 type: number
 *                 minimum: 0
 *                 description: Optional cost per unit (uses item's unitCost if not provided)
 *                 example: 45.99
 *           examples:
 *             damage:
 *               summary: Record damaged inventory
 *               value:
 *                 quantity: -10
 *                 reason: "DAMAGE"
 *                 notes: "Water damage in warehouse - boxes 15-25"
 *             physicalCount:
 *               summary: Physical count adjustment
 *               value:
 *                 quantity: 3
 *                 reason: "COUNT_ADJUSTMENT"
 *                 referenceNumber: "COUNT-2024-Q1"
 *                 notes: "Quarterly physical inventory count - found 3 additional units"
 *             theft:
 *               summary: Record theft loss
 *               value:
 *                 quantity: -25
 *                 reason: "THEFT"
 *                 referenceNumber: "INCIDENT-2024-042"
 *                 notes: "Reported to security - see incident report"
 *     responses:
 *       200:
 *         description: Inventory quantity adjusted successfully
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
 *                   description: Updated inventory item with new quantity
 *                 message:
 *                   type: string
 *                   example: "Inventory quantity adjusted successfully"
 *       400:
 *         description: Bad request - Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or resource access denied
 *       404:
 *         description: Not found - Inventory item not found
 *       422:
 *         description: Unprocessable entity - Validation errors (e.g., adjustment would result in negative quantity)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:itemId/adjust',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  validateZod(adjustQuantitySchema),
  adjustQuantity
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/{itemId}/transfer:
 *   post:
 *     tags: [Inventory]
 *     summary: Transfer inventory between locations
 *     description: |
 *       Transfers inventory quantity from one location to another within the same organization.
 *       Creates transaction records for both source and destination locations and maintains
 *       complete audit trail. Essential for multi-location inventory management.
 *       Available to all authenticated users.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Inventory item ID
 *         schema:
 *           type: string
 *           example: "inv_item_1234"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromLocationId
 *               - toLocationId
 *               - quantity
 *             properties:
 *               fromLocationId:
 *                 type: string
 *                 description: Source location ID
 *                 example: "loc_warehouse_main"
 *               toLocationId:
 *                 type: string
 *                 description: Destination location ID
 *                 example: "loc_retail_store_1"
 *               quantity:
 *                 type: number
 *                 description: Quantity to transfer (must be positive)
 *                 minimum: 0.01
 *                 example: 50
 *               referenceNumber:
 *                 type: string
 *                 maxLength: 100
 *                 description: Transfer order or reference number
 *                 example: "XFER-2024-001"
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Notes about the transfer
 *                 example: "Monthly stock replenishment for retail location"
 *           examples:
 *             storeReplenishment:
 *               summary: Warehouse to store transfer
 *               value:
 *                 fromLocationId: "loc_warehouse_main"
 *                 toLocationId: "loc_retail_store_1"
 *                 quantity: 50
 *                 referenceNumber: "XFER-2024-001"
 *                 notes: "Monthly stock replenishment for retail location"
 *             returnToWarehouse:
 *               summary: Return from store to warehouse
 *               value:
 *                 fromLocationId: "loc_retail_store_2"
 *                 toLocationId: "loc_warehouse_main"
 *                 quantity: 15
 *                 notes: "Excess inventory return - slow-moving item"
 *     responses:
 *       200:
 *         description: Inventory transferred successfully
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
 *                   description: Updated inventory item
 *                 message:
 *                   type: string
 *                   example: "Inventory transferred successfully"
 *       400:
 *         description: Bad request - Invalid input data or locations are the same
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or resource access denied
 *       404:
 *         description: Not found - Inventory item or location not found
 *       422:
 *         description: Unprocessable entity - Validation errors (e.g., insufficient quantity at source location)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:itemId/transfer',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  validateZod(transferInventorySchema),
  transferInventory
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/{itemId}/stock-count:
 *   post:
 *     tags: [Inventory]
 *     summary: Perform physical stock count
 *     description: |
 *       Records the results of a physical inventory count and automatically adjusts the system quantity
 *       to match the counted quantity. Creates a COUNT_ADJUSTMENT transaction for the difference.
 *       Essential for maintaining inventory accuracy and periodic reconciliation. Available to all authenticated users.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Inventory item ID
 *         schema:
 *           type: string
 *           example: "inv_item_1234"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - countedQuantity
 *             properties:
 *               countedQuantity:
 *                 type: number
 *                 description: Actual quantity counted during physical inventory
 *                 minimum: 0
 *                 example: 147
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Notes about the stock count
 *                 example: "Q1 2024 physical inventory count - Section A, Shelf 3"
 *           examples:
 *             quarterlyCount:
 *               summary: Quarterly physical count
 *               value:
 *                 countedQuantity: 147
 *                 notes: "Q1 2024 physical inventory count - Section A, Shelf 3"
 *             cycleCount:
 *               summary: Cycle count verification
 *               value:
 *                 countedQuantity: 52
 *                 notes: "Weekly cycle count - high-value items - verified 2x"
 *     responses:
 *       200:
 *         description: Stock count recorded successfully
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
 *                   description: Transaction record for the adjustment
 *                   properties:
 *                     id:
 *                       type: string
 *                     inventoryItemId:
 *                       type: string
 *                     type:
 *                       type: string
 *                       example: "COUNT_ADJUSTMENT"
 *                     quantity:
 *                       type: number
 *                       description: Adjustment amount (difference between system and counted)
 *                     quantityBefore:
 *                       type: number
 *                     quantityAfter:
 *                       type: number
 *                     notes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *                   example: "Stock count adjustment recorded"
 *       400:
 *         description: Bad request - Invalid counted quantity (negative or missing)
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions or resource access denied
 *       404:
 *         description: Not found - Inventory item not found
 *       422:
 *         description: Unprocessable entity - Validation errors
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:itemId/stock-count',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  performStockCount
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/inventory/{itemId}:
 *   delete:
 *     tags: [Inventory]
 *     summary: Delete inventory item
 *     description: |
 *       Soft-deletes an inventory item (sets deletedAt timestamp). The item is not permanently removed
 *       from the database to maintain referential integrity with historical transactions, purchase orders,
 *       and sales records. Deleted items are excluded from standard queries. Requires Manager+ role.
 *       Creates audit trail entry.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Inventory item ID
 *         schema:
 *           type: string
 *           example: "inv_item_1234"
 *     responses:
 *       200:
 *         description: Inventory item deleted successfully
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
 *                   example: "Inventory item deleted successfully"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions (requires Manager+ role) or resource access denied
 *       404:
 *         description: Not found - Inventory item not found or already deleted
 *       422:
 *         description: Unprocessable entity - Cannot delete item with active transactions or references
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:itemId',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  deleteInventoryItem
);

export default router;
