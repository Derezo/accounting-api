import { Router } from 'express';
import {
  createBill,
  getBillById,
  getBills,
  updateBill,
  approveBill,
  recordBillPayment,
  deleteBill,
  getBillStats,
} from '../controllers/bill.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateZod } from '../middleware/validation.middleware';
import { checkResourceAccess } from '../middleware/resource-permission.middleware';
import { UserRole } from '../types/enums';
import {
  createBillSchema,
  updateBillSchema,
  getBillsFiltersSchema,
  recordBillPaymentSchema,
} from '../validators/bill.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Statistics endpoint must come before /:billId to avoid route collision
router.get(
  '/stats',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  getBillStats
);

router.post(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  validateZod(createBillSchema),
  createBill
);

router.get(
  '/',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  validateZod(getBillsFiltersSchema, 'query'),
  getBills
);

router.get(
  '/:billId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN, UserRole.EMPLOYEE),
  checkResourceAccess('bill', 'billId'),
  getBillById
);

router.put(
  '/:billId',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('bill', 'billId'),
  validateZod(updateBillSchema),
  updateBill
);

router.post(
  '/:billId/approve',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('bill', 'billId'),
  approveBill
);

router.post(
  '/:billId/payments',
  authorize(UserRole.ACCOUNTANT, UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('bill', 'billId'),
  validateZod(recordBillPaymentSchema),
  recordBillPayment
);

router.delete(
  '/:billId',
  authorize(UserRole.MANAGER, UserRole.ADMIN),
  checkResourceAccess('bill', 'billId'),
  deleteBill
);

export default router;