/**
 * Admin System Routes
 * System logs and health monitoring endpoints for admin panel
 */

import express from 'express';
import {
  getSystemLogs,
  getLogSources,
  getLogStats,
  deleteOldLogs,
  getSystemHealth,
} from '../controllers/admin-system.controller';

const router = express.Router();

// System Logs endpoints
router.get('/logs', getSystemLogs);
router.get('/logs/sources', getLogSources);
router.get('/logs/stats', getLogStats);
router.delete('/logs', deleteOldLogs);

// System Health endpoint
router.get('/health', getSystemHealth);

export default router;
