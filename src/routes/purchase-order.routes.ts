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

// Statistics endpoint must come before /:purchaseOrderId to avoid route collision
router.get(
  '/stats',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getPurchaseOrderStats
);

router.post(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  validateZod(createPurchaseOrderSchema),
  createPurchaseOrder
);

router.get(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  validateZod(getPurchaseOrdersFiltersSchema, 'query'),
  getPurchaseOrders
);

router.get(
  '/:purchaseOrderId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  getPurchaseOrderById
);

router.put(
  '/:purchaseOrderId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  validateZod(updatePurchaseOrderSchema),
  updatePurchaseOrder
);

router.post(
  '/:purchaseOrderId/approve',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  approvePurchaseOrder
);

router.post(
  '/:purchaseOrderId/receive',
  authorize(UserRole.EMPLOYEE, UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  validateZod(receiveItemsSchema),
  receiveItems
);

router.post(
  '/:purchaseOrderId/close',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  closePurchaseOrder
);

router.post(
  '/:purchaseOrderId/cancel',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  cancelPurchaseOrder
);

router.delete(
  '/:purchaseOrderId',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('purchaseOrder', 'purchaseOrderId'),
  deletePurchaseOrder
);

export default router;