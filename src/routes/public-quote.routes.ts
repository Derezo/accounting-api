import express from 'express';
import { publicQuoteController } from '../controllers/public-quote.controller';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';

const router = express.Router();

/**
 * Public Quote Routes
 * These endpoints are publicly accessible for customers to view and interact with quotes
 * No authentication required, but secured with tokens
 */

/**
 * @route GET /api/v1/public/quotes/:quoteId/view
 * @desc View quote details (public, requires view token)
 * @access Public (with token)
 */
router.get(
  '/:quoteId/view',
  rateLimitMiddleware({ windowMs: 60000, max: 20 }), // 20 requests per minute
  publicQuoteController.viewQuote.bind(publicQuoteController)
);

/**
 * @route GET /api/v1/public/quotes/:quoteId/status
 * @desc Check quote status (public, requires view token)
 * @access Public (with token)
 */
router.get(
  '/:quoteId/status',
  rateLimitMiddleware({ windowMs: 60000, max: 30 }), // 30 requests per minute
  publicQuoteController.checkQuoteStatus.bind(publicQuoteController)
);

/**
 * @route POST /api/v1/public/quotes/:quoteId/accept
 * @desc Accept quote (public, requires acceptance token)
 * @access Public (with token)
 */
router.post(
  '/:quoteId/accept',
  rateLimitMiddleware({ windowMs: 60000, max: 5 }), // 5 requests per minute
  publicQuoteController.acceptQuote.bind(publicQuoteController)
);

/**
 * @route POST /api/v1/public/quotes/:quoteId/reject
 * @desc Reject quote (public, requires acceptance token)
 * @access Public (with token)
 */
router.post(
  '/:quoteId/reject',
  rateLimitMiddleware({ windowMs: 60000, max: 5 }), // 5 requests per minute
  publicQuoteController.rejectQuote.bind(publicQuoteController)
);

export default router;