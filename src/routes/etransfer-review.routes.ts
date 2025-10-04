import { Router } from 'express';
import { eTransferReviewController } from '../controllers/etransfer-review.controller';
import { authenticateToken, authorize } from '../middleware/auth.middleware';
import { validateOrganizationAccess } from '../middleware/organization.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { UserRole } from '../types/enums';

const router = Router({ mergeParams: true });

/**
 * E-Transfer Review Routes
 * Admin interface for reviewing and managing e-Transfer auto-matching
 *
 * Base path: /api/v1/organizations/:orgId/etransfer/review
 */

/**
 * @route GET /api/v1/organizations/:orgId/etransfer/review/pending
 * @desc Get all e-Transfers pending manual review
 * @access Admin, Accountant
 */
router.get(
  '/pending',
  authenticateToken,
  validateOrganizationAccess,
  authorize(UserRole.ADMIN, UserRole.ACCOUNTANT),
  rateLimitMiddleware({ windowMs: 60000, max: 100 }),
  (req, res) => eTransferReviewController.getPendingReviews(req, res)
);

/**
 * @route POST /api/v1/organizations/:orgId/etransfer/review/:paymentId/approve
 * @desc Approve an e-Transfer match
 * @access Admin, Accountant
 */
router.post(
  '/:paymentId/approve',
  authenticateToken,
  validateOrganizationAccess,
  authorize(UserRole.ADMIN, UserRole.ACCOUNTANT),
  rateLimitMiddleware({ windowMs: 60000, max: 50 }),
  (req, res) => eTransferReviewController.approveMatch(req, res)
);

/**
 * @route POST /api/v1/organizations/:orgId/etransfer/review/:paymentId/reassign
 * @desc Reassign e-Transfer to different invoice
 * @access Admin, Accountant
 */
router.post(
  '/:paymentId/reassign',
  authenticateToken,
  validateOrganizationAccess,
  authorize(UserRole.ADMIN, UserRole.ACCOUNTANT),
  rateLimitMiddleware({ windowMs: 60000, max: 50 }),
  (req, res) => eTransferReviewController.reassignMatch(req, res)
);

/**
 * @route POST /api/v1/organizations/:orgId/etransfer/review/:paymentId/reject
 * @desc Reject an e-Transfer
 * @access Admin
 */
router.post(
  '/:paymentId/reject',
  authenticateToken,
  validateOrganizationAccess,
  authorize(UserRole.ADMIN),
  rateLimitMiddleware({ windowMs: 60000, max: 30 }),
  (req, res) => eTransferReviewController.rejectTransfer(req, res)
);

/**
 * @route GET /api/v1/organizations/:orgId/etransfer/review/stats
 * @desc Get e-Transfer automation statistics
 * @access Admin, Accountant
 */
router.get(
  '/stats',
  authenticateToken,
  validateOrganizationAccess,
  authorize(UserRole.ADMIN, UserRole.ACCOUNTANT),
  rateLimitMiddleware({ windowMs: 60000, max: 100 }),
  (req, res) => eTransferReviewController.getStats(req, res)
);

export default router;
