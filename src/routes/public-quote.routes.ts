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
 * @swagger
 * /api/v1/public/quotes/{quoteId}/view:
 *   get:
 *     tags: [Public Quotes]
 *     summary: View quote details (public, no authentication)
 *     description: Allows customers to view complete quote details using a secure view token provided via email. No authentication required. Tracks quote views for analytics. Quote must be active and not expired.
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *           example: "quote_1234567890"
 *       - in: query
 *         name: token
 *         required: true
 *         description: Secure view token (provided in email link)
 *         schema:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Quote details retrieved successfully
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
 *                     quoteNumber:
 *                       type: string
 *                       example: "QT-2024-001"
 *                     status:
 *                       type: string
 *                       enum: [DRAFT, SENT, VIEWED, ACCEPTED, REJECTED, EXPIRED]
 *                       example: "SENT"
 *                     description:
 *                       type: string
 *                       description: Quote description
 *                     terms:
 *                       type: string
 *                       description: Terms and conditions
 *                     notes:
 *                       type: string
 *                       description: Additional notes for customer
 *                     subtotal:
 *                       type: number
 *                       format: float
 *                       example: 1000.00
 *                     taxAmount:
 *                       type: number
 *                       format: float
 *                       example: 130.00
 *                     total:
 *                       type: number
 *                       format: float
 *                       example: 1130.00
 *                     currency:
 *                       type: string
 *                       default: "CAD"
 *                       example: "CAD"
 *                     validUntil:
 *                       type: string
 *                       format: date
 *                       description: Quote expiration date
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: Exact expiration timestamp
 *                     sentAt:
 *                       type: string
 *                       format: date-time
 *                     viewedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     acceptedAt:
 *                       type: string
 *                       format: date-time
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
 *                           unitPrice:
 *                             type: number
 *                             format: float
 *                           discountPercent:
 *                             type: number
 *                             format: float
 *                           taxRate:
 *                             type: number
 *                             format: float
 *                           subtotal:
 *                             type: number
 *                             format: float
 *                           discountAmount:
 *                             type: number
 *                             format: float
 *                           taxAmount:
 *                             type: number
 *                             format: float
 *                           total:
 *                             type: number
 *                             format: float
 *                           product:
 *                             type: object
 *                             nullable: true
 *                           service:
 *                             type: object
 *                             nullable: true
 *                     customer:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         phone:
 *                           type: string
 *                     organization:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         phone:
 *                           type: string
 *                         website:
 *                           type: string
 *                         settings:
 *                           type: object
 *                     acceptanceToken:
 *                       type: string
 *                       description: Token required for accepting/rejecting (only provided if quote is in SENT status)
 *                       nullable: true
 *       400:
 *         description: Invalid request - token required
 *       404:
 *         description: Quote not found or invalid token
 *       410:
 *         description: Quote has expired
 *       429:
 *         description: Rate limit exceeded (20 requests per minute)
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:quoteId/view',
  rateLimitMiddleware({ windowMs: 60000, max: 20 }), // 20 requests per minute
  publicQuoteController.viewQuote.bind(publicQuoteController)
);

/**
 * @swagger
 * /api/v1/public/quotes/{quoteId}/status:
 *   get:
 *     tags: [Public Quotes]
 *     summary: Check quote status (public, no authentication)
 *     description: Allows customers to check the current status of a quote without viewing full details. Useful for quick status checks and expiration verification. No authentication required.
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: token
 *         required: true
 *         description: Secure view token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quote status retrieved successfully
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
 *                     quoteNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [DRAFT, SENT, VIEWED, ACCEPTED, REJECTED, EXPIRED]
 *                     sentAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     viewedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     acceptedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     rejectedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     isExpired:
 *                       type: boolean
 *                       description: Whether the quote has expired
 *       400:
 *         description: Invalid request - token required
 *       404:
 *         description: Quote not found or invalid token
 *       429:
 *         description: Rate limit exceeded (30 requests per minute)
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:quoteId/status',
  rateLimitMiddleware({ windowMs: 60000, max: 30 }), // 30 requests per minute
  publicQuoteController.checkQuoteStatus.bind(publicQuoteController)
);

/**
 * @swagger
 * /api/v1/public/quotes/{quoteId}/accept:
 *   post:
 *     tags: [Public Quotes]
 *     summary: Accept quote (public, no authentication)
 *     description: Allows customers to accept a quote using a secure acceptance token. Triggers workflow advancement to "Quote Accepted" stage and provides appointment booking information. No authentication required. Records customer email and IP for audit purposes.
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - customerEmail
 *             properties:
 *               token:
 *                 type: string
 *                 description: Secure acceptance token (provided in quote view response)
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               customerEmail:
 *                 type: string
 *                 format: email
 *                 description: Customer email for verification
 *                 example: "customer@example.com"
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional notes or comments from customer
 *                 example: "Looking forward to working with you!"
 *     responses:
 *       200:
 *         description: Quote accepted successfully
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
 *                     quoteNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "ACCEPTED"
 *                     acceptedAt:
 *                       type: string
 *                       format: date-time
 *                     message:
 *                       type: string
 *                       example: "Quote accepted successfully! Please book your appointment to proceed."
 *                     bookingUrl:
 *                       type: string
 *                       description: URL for booking appointment
 *                       example: "https://account.lifestreamdynamics.com/public/appointments/book?quoteId=quote_123"
 *                     bookingToken:
 *                       type: string
 *                       description: Token for appointment booking (if applicable)
 *                       nullable: true
 *       400:
 *         description: Invalid request - missing token or email, or invalid email format
 *       401:
 *         description: Invalid acceptance token
 *       404:
 *         description: Quote not found
 *       409:
 *         description: Conflict - quote already accepted/rejected or expired
 *       429:
 *         description: Rate limit exceeded (5 requests per minute)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:quoteId/accept',
  rateLimitMiddleware({ windowMs: 60000, max: 5 }), // 5 requests per minute
  publicQuoteController.acceptQuote.bind(publicQuoteController)
);

/**
 * @swagger
 * /api/v1/public/quotes/{quoteId}/reject:
 *   post:
 *     tags: [Public Quotes]
 *     summary: Reject quote (public, no authentication)
 *     description: Allows customers to reject a quote using a secure acceptance token. Optionally includes rejection reason for feedback. No authentication required. Records customer email and IP for audit purposes.
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         description: Quote ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - customerEmail
 *             properties:
 *               token:
 *                 type: string
 *                 description: Secure acceptance token (provided in quote view response)
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               customerEmail:
 *                 type: string
 *                 format: email
 *                 description: Customer email for verification
 *                 example: "customer@example.com"
 *               reason:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Optional reason for rejection (for feedback)
 *                 example: "Found a better price elsewhere"
 *     responses:
 *       200:
 *         description: Quote rejected successfully
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
 *                     quoteNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "REJECTED"
 *                     rejectedAt:
 *                       type: string
 *                       format: date-time
 *                     message:
 *                       type: string
 *                       example: "Thank you for your consideration. We appreciate the opportunity to quote your project."
 *       400:
 *         description: Invalid request - missing token or email, or invalid email format
 *       401:
 *         description: Invalid acceptance token
 *       404:
 *         description: Quote not found
 *       409:
 *         description: Conflict - quote already accepted/rejected or expired
 *       429:
 *         description: Rate limit exceeded (5 requests per minute)
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:quoteId/reject',
  rateLimitMiddleware({ windowMs: 60000, max: 5 }), // 5 requests per minute
  publicQuoteController.rejectQuote.bind(publicQuoteController)
);

export default router;
