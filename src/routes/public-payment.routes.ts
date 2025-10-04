import { Router } from 'express';
import { publicPaymentController } from '../controllers/public-payment.controller';
import { body, param } from 'express-validator';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Public Payment Portal
 *     description: Customer payment portal (token-based authentication, no JWT required)
 */

/**
 * @swagger
 * /api/v1/public/payment/{token}/invoice:
 *   get:
 *     tags: [Public Payment Portal]
 *     summary: Get invoice details for payment
 *     description: |
 *       Public endpoint - retrieve invoice details using payment token.
 *       No authentication required, secured by payment token.
 *
 *       **Security:**
 *       - Payment token validated
 *       - Token expiration checked
 *       - IP address logged
 *       - View count incremented
 *
 *       **Rate Limits:**
 *       - 20 requests per minute per IP
 *
 *       Returns sanitized invoice data without exposing sensitive organization information.
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment portal token
 *         example: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
 *     responses:
 *       200:
 *         description: Invoice details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 invoice:
 *                   type: object
 *                   nullable: true
 *                 balance:
 *                   type: object
 *                   properties:
 *                     totalOutstanding:
 *                       type: number
 *                     overdueAmount:
 *                       type: number
 *                     upcomingPayments:
 *                       type: array
 *                       items:
 *                         type: object
 *                 tokenExpiresAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Invalid or expired token
 *       404:
 *         description: Token not found or expired
 *       429:
 *         description: Rate limit exceeded
 */
router.get(
  '/:token/invoice',
  publicPaymentController.getInvoiceForPayment.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/create-intent:
 *   post:
 *     tags: [Public Payment Portal]
 *     summary: Create Stripe PaymentIntent
 *     description: |
 *       Creates a Stripe PaymentIntent for processing payment.
 *       Returns client secret for Stripe.js integration.
 *
 *       **Security:**
 *       - Token validated
 *       - Amount validated against invoice balance
 *       - Payment attempts tracked
 *       - IP address logged
 *
 *       **Rate Limits:**
 *       - 5 payment intents per minute per IP
 *
 *       **3D Secure:**
 *       - Automatically handles 3DS authentication
 *       - Client secret used for Stripe.js confirmCardPayment()
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 format: decimal
 *                 minimum: 0.50
 *                 description: Payment amount in dollars
 *                 example: 1500.00
 *               savePaymentMethod:
 *                 type: boolean
 *                 description: Save payment method for future use
 *                 default: false
 *     responses:
 *       201:
 *         description: Payment intent created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 clientSecret:
 *                   type: string
 *                   description: Stripe client secret for confirmCardPayment()
 *                 paymentIntentId:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *       400:
 *         description: Invalid amount or exceeds balance
 *       401:
 *         description: Invalid or expired token
 *       429:
 *         description: Too many payment attempts
 */
router.post(
  '/:token/create-intent',
  [
    param('token').notEmpty().withMessage('Token is required'),
    body('amount')
      .isFloat({ min: 0.50 })
      .withMessage('Amount must be at least $0.50'),
    body('savePaymentMethod')
      .optional()
      .isBoolean()
      .withMessage('savePaymentMethod must be boolean')
  ],
  publicPaymentController.createPaymentIntent.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/confirm:
 *   post:
 *     tags: [Public Payment Portal]
 *     summary: Confirm payment
 *     description: |
 *       Confirms a successful payment and finalizes the transaction.
 *       Called after Stripe.js confirmCardPayment() succeeds.
 *
 *       **Actions Performed:**
 *       - Verifies payment succeeded in Stripe
 *       - Updates invoice balance
 *       - Marks token as used
 *       - Logs payment in audit trail
 *       - Triggers confirmation email
 *
 *       **Security:**
 *       - Token automatically invalidated after use
 *       - Payment intent verified against customer
 *       - Amount reconciliation
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIntentId
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *                 description: Stripe PaymentIntent ID
 *                 example: "pi_1234567890abcdef"
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
 *       400:
 *         description: Payment confirmation failed
 *       404:
 *         description: Payment not found
 */
router.post(
  '/:token/confirm',
  [
    param('token').notEmpty().withMessage('Token is required'),
    body('paymentIntentId')
      .notEmpty()
      .withMessage('Payment intent ID is required')
  ],
  publicPaymentController.confirmPayment.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/history:
 *   get:
 *     tags: [Public Payment Portal]
 *     summary: Get payment history
 *     description: |
 *       Returns all payments made by the customer.
 *       Limited to last 50 payments.
 *
 *       **Rate Limits:**
 *       - 20 requests per minute per IP
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 payments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       paymentNumber:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       paymentDate:
 *                         type: string
 *                         format: date-time
 *                       paymentMethod:
 *                         type: string
 *                       status:
 *                         type: string
 *                 total:
 *                   type: number
 *       401:
 *         description: Invalid or expired token
 */
router.get(
  '/:token/history',
  publicPaymentController.getPaymentHistory.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/methods:
 *   get:
 *     tags: [Public Payment Portal]
 *     summary: List saved payment methods
 *     description: |
 *       Returns customer's saved payment methods.
 *       Sensitive data (full card numbers) is not exposed.
 *
 *       **Rate Limits:**
 *       - 20 requests per minute per IP
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment methods retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 paymentMethods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [CARD, BANK_ACCOUNT]
 *                       last4:
 *                         type: string
 *                       brand:
 *                         type: string
 *                       expiryMonth:
 *                         type: integer
 *                       expiryYear:
 *                         type: integer
 *                       isDefault:
 *                         type: boolean
 *       401:
 *         description: Invalid or expired token
 */
router.get(
  '/:token/methods',
  publicPaymentController.listPaymentMethods.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/methods:
 *   post:
 *     tags: [Public Payment Portal]
 *     summary: Add payment method
 *     description: |
 *       Saves a new payment method via Stripe.
 *       Payment method must be created client-side via Stripe.js first.
 *
 *       **Flow:**
 *       1. Client creates payment method with Stripe.js
 *       2. Client sends stripePaymentMethodId to this endpoint
 *       3. Server attaches payment method to customer
 *       4. Payment method saved for future use
 *
 *       **Rate Limits:**
 *       - 5 additions per minute per IP
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stripePaymentMethodId
 *             properties:
 *               stripePaymentMethodId:
 *                 type: string
 *                 description: Stripe payment method ID from Stripe.js
 *                 example: "pm_1234567890abcdef"
 *               setAsDefault:
 *                 type: boolean
 *                 description: Set as default payment method
 *                 default: false
 *     responses:
 *       201:
 *         description: Payment method added successfully
 *       400:
 *         description: Invalid payment method
 *       401:
 *         description: Invalid or expired token
 */
router.post(
  '/:token/methods',
  [
    param('token').notEmpty().withMessage('Token is required'),
    body('stripePaymentMethodId')
      .notEmpty()
      .withMessage('Stripe payment method ID is required'),
    body('setAsDefault')
      .optional()
      .isBoolean()
      .withMessage('setAsDefault must be boolean')
  ],
  publicPaymentController.addPaymentMethod.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/methods/{methodId}:
 *   delete:
 *     tags: [Public Payment Portal]
 *     summary: Remove payment method
 *     description: |
 *       Deactivates a saved payment method.
 *       Payment method is soft-deleted (not permanently removed).
 *
 *       **Security:**
 *       - Verifies payment method belongs to customer
 *       - Detaches from Stripe
 *       - Audit logged
 *
 *       **Rate Limits:**
 *       - 5 deletions per minute per IP
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: methodId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment method ID
 *     responses:
 *       200:
 *         description: Payment method removed successfully
 *       404:
 *         description: Payment method not found
 *       401:
 *         description: Invalid or expired token
 */
router.delete(
  '/:token/methods/:methodId',
  [
    param('token').notEmpty().withMessage('Token is required'),
    param('methodId').notEmpty().withMessage('Method ID is required')
  ],
  publicPaymentController.removePaymentMethod.bind(publicPaymentController)
);

/**
 * @swagger
 * /api/v1/public/payment/{token}/methods/{methodId}/default:
 *   put:
 *     tags: [Public Payment Portal]
 *     summary: Set default payment method
 *     description: |
 *       Updates which payment method is the customer's default.
 *       Only one method can be default at a time.
 *
 *       **Actions:**
 *       - Unsets previous default
 *       - Sets new default
 *       - Audit logged
 *
 *       **Rate Limits:**
 *       - 5 updates per minute per IP
 *     security: []
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: methodId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment method ID to set as default
 *     responses:
 *       200:
 *         description: Default payment method updated successfully
 *       404:
 *         description: Payment method not found
 *       401:
 *         description: Invalid or expired token
 */
router.put(
  '/:token/methods/:methodId/default',
  [
    param('token').notEmpty().withMessage('Token is required'),
    param('methodId').notEmpty().withMessage('Method ID is required')
  ],
  publicPaymentController.setDefaultPaymentMethod.bind(publicPaymentController)
);

export default router;
