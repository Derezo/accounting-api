/**
 * System Analytics Routes
 * System-wide analytics endpoints for admin panel
 * Phase 4: System Analytics from Admin Panel Implementation Roadmap
 */

import express from 'express';
import {
  getSystemAnalytics,
  exportAnalytics,
} from '../controllers/system-analytics.controller';

const router = express.Router();

/**
 * GET /admin/analytics
 * Get system-wide analytics with optional date range
 * Requires SUPER_ADMIN permission
 */
router.get('/', getSystemAnalytics);

/**
 * POST /admin/analytics/export
 * Export analytics report in PDF/Excel/CSV format
 * Requires SUPER_ADMIN permission
 */
router.post('/export', exportAnalytics);

export default router;
