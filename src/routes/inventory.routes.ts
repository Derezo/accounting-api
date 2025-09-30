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

// Special endpoints must come before /:itemId to avoid route collision
router.get(
  '/stats',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getInventoryStats
);

router.get(
  '/valuation',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getInventoryValuation
);

router.get(
  '/low-stock',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getLowStockItems
);

router.get(
  '/transactions',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  getInventoryTransactions
);

router.post(
  '/transactions',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  createInventoryTransaction
);

router.post(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  validateZod(createInventoryItemSchema),
  createInventoryItem
);

router.get(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  validateZod(getInventoryItemsFiltersSchema, 'query'),
  getInventoryItems
);

router.get(
  '/:itemId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  checkResourceAccess('inventory', 'itemId'),
  getInventoryItemById
);

router.put(
  '/:itemId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  validateZod(updateInventoryItemSchema),
  updateInventoryItem
);

router.post(
  '/:itemId/adjust',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  validateZod(adjustQuantitySchema),
  adjustQuantity
);

router.post(
  '/:itemId/transfer',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  validateZod(transferInventorySchema),
  transferInventory
);

router.post(
  '/:itemId/stock-count',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  performStockCount
);

router.delete(
  '/:itemId',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('inventory', 'itemId'),
  deleteInventoryItem
);

export default router;