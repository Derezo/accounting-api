import { Router } from 'express';
import {
  paymentAnalyticsController,
  validatePaymentTrends,
  validatePaymentMethodAnalytics,
  validateCustomerPaymentBehavior,
  validatePaymentForecast,
  validateCashFlowProjection,
  validateFraudAlerts
} from '../controllers/payment-analytics.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply audit logging to all authenticated routes
router.use(auditMiddleware);

/**
 * @swagger
 * /payment-analytics/trends:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Get payment trends analysis
 *     description: Retrieves comprehensive payment trends data including volume, amounts, seasonality patterns, and growth metrics for business intelligence and forecasting.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter, year]
 *           default: month
 *         description: Time period granularity for trend analysis
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter trends for specific customer
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *           enum: [CASH, CHEQUE, BANK_TRANSFER, CREDIT_CARD, PAYPAL, STRIPE, OTHER]
 *         description: Filter by payment method
 *       - in: query
 *         name: includeForecasting
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to include forecasting data
 *       - in: query
 *         name: compareToBaseline
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to compare to baseline/previous period
 *     responses:
 *       200:
 *         description: Payment trends retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysisMetadata:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     dataPoints:
 *                       type: integer
 *                       description: Number of data points in analysis
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                 overallTrends:
 *                   type: object
 *                   properties:
 *                     totalPayments:
 *                       type: integer
 *                       description: Total number of payments in period
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total payment amount
 *                     averagePayment:
 *                       type: number
 *                       format: float
 *                       description: Average payment amount
 *                     growthRate:
 *                       type: number
 *                       format: float
 *                       description: Period-over-period growth rate percentage
 *                     trendDirection:
 *                       type: string
 *                       enum: [UPWARD, DOWNWARD, STABLE, VOLATILE]
 *                       description: Overall trend direction
 *                 timeSeries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       paymentCount:
 *                         type: integer
 *                       paymentAmount:
 *                         type: number
 *                         format: float
 *                       averageAmount:
 *                         type: number
 *                         format: float
 *                       cumulativeAmount:
 *                         type: number
 *                         format: float
 *                   description: Time series data points
 *                 seasonalityAnalysis:
 *                   type: object
 *                   properties:
 *                     hasSeasonality:
 *                       type: boolean
 *                       description: Whether seasonal patterns were detected
 *                     peakPeriods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                           avgIncrease:
 *                             type: number
 *                             format: float
 *                     lowPeriods:
 *                       type: array
 *                       items:
 *                         type: object
 *                     seasonalityStrength:
 *                       type: number
 *                       format: float
 *                       description: Strength of seasonal pattern (0-1)
 *                 paymentMethodBreakdown:
 *                   type: object
 *                   properties:
 *                     CASH:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         trend:
 *                           type: string
 *                     CHEQUE:
 *                       type: object
 *                     BANK_TRANSFER:
 *                       type: object
 *                     CREDIT_CARD:
 *                       type: object
 *                     STRIPE:
 *                       type: object
 *                     OTHER:
 *                       type: object
 *                 insights:
 *                   type: object
 *                   properties:
 *                     keyFindings:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Key insights from the analysis
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Business recommendations
 *                     anomalies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           description:
 *                             type: string
 *                           severity:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH]
 *                       description: Detected anomalies in payment patterns
 *                 forecasting:
 *                   type: object
 *                   properties:
 *                     nextPeriodPrediction:
 *                       type: object
 *                       properties:
 *                         expectedPayments:
 *                           type: integer
 *                         expectedAmount:
 *                           type: number
 *                           format: float
 *                         confidenceInterval:
 *                           type: object
 *                           properties:
 *                             lower:
 *                               type: number
 *                               format: float
 *                             upper:
 *                               type: number
 *                               format: float
 *                     modelAccuracy:
 *                       type: number
 *                       format: float
 *                       description: Forecasting model accuracy percentage
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 */
router.get(
  '/trends',
  validatePaymentTrends,
  paymentAnalyticsController.getPaymentTrends.bind(paymentAnalyticsController)
);

/**
 * @swagger
 * /payment-analytics/methods:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Get payment method analytics
 *     description: Analyzes payment method usage patterns, preferences, success rates, and processing costs to optimize payment acceptance strategies.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *         description: Analysis period
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter for specific customer
 *       - in: query
 *         name: includeProcessingCosts
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include processing cost analysis
 *       - in: query
 *         name: includeFailureAnalysis
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include failure rate analysis
 *     responses:
 *       200:
 *         description: Payment method analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalTransactions:
 *                       type: integer
 *                       description: Total payment transactions analyzed
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                       description: Total payment amount
 *                     uniquePaymentMethods:
 *                       type: integer
 *                       description: Number of different payment methods used
 *                     analysisComplete:
 *                       type: boolean
 *                       description: Whether analysis completed successfully
 *                 methodBreakdown:
 *                   type: object
 *                   properties:
 *                     CASH:
 *                       type: object
 *                       properties:
 *                         transactions:
 *                           type: integer
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                         successRate:
 *                           type: number
 *                           format: float
 *                         processingCost:
 *                           type: number
 *                           format: float
 *                         processingTime:
 *                           type: number
 *                           format: float
 *                           description: Average processing time in hours
 *                         customerPreference:
 *                           type: number
 *                           format: float
 *                           description: Customer preference score (0-1)
 *                     CHEQUE:
 *                       type: object
 *                       properties:
 *                         transactions:
 *                           type: integer
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                         successRate:
 *                           type: number
 *                           format: float
 *                         bounceRate:
 *                           type: number
 *                           format: float
 *                         processingCost:
 *                           type: number
 *                           format: float
 *                         clearingTime:
 *                           type: number
 *                           format: float
 *                           description: Average clearing time in days
 *                     BANK_TRANSFER:
 *                       type: object
 *                     CREDIT_CARD:
 *                       type: object
 *                     PAYPAL:
 *                       type: object
 *                     STRIPE:
 *                       type: object
 *                       properties:
 *                         transactions:
 *                           type: integer
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         averageAmount:
 *                           type: number
 *                           format: float
 *                         successRate:
 *                           type: number
 *                           format: float
 *                         declineRate:
 *                           type: number
 *                           format: float
 *                         chargebackRate:
 *                           type: number
 *                           format: float
 *                         processingFee:
 *                           type: number
 *                           format: float
 *                         settlementTime:
 *                           type: number
 *                           format: float
 *                           description: Settlement time in days
 *                     OTHER:
 *                       type: object
 *                 trends:
 *                   type: object
 *                   properties:
 *                     growingMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           method:
 *                             type: string
 *                           growthRate:
 *                             type: number
 *                             format: float
 *                     decliningMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                     seasonalPatterns:
 *                       type: object
 *                       description: Seasonal usage patterns by method
 *                 costAnalysis:
 *                   type: object
 *                   properties:
 *                     totalProcessingCosts:
 *                       type: number
 *                       format: float
 *                     costByMethod:
 *                       type: object
 *                     costPerTransaction:
 *                       type: number
 *                       format: float
 *                     costOptimizationPotential:
 *                       type: number
 *                       format: float
 *                       description: Potential cost savings from optimization
 *                 performanceMetrics:
 *                   type: object
 *                   properties:
 *                     overallSuccessRate:
 *                       type: number
 *                       format: float
 *                     averageProcessingTime:
 *                       type: number
 *                       format: float
 *                     customerSatisfactionScore:
 *                       type: number
 *                       format: float
 *                     disputeRate:
 *                       type: number
 *                       format: float
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [PROMOTE_METHOD, DISCOURAGE_METHOD, OPTIMIZE_PROCESSING, REDUCE_COSTS]
 *                       method:
 *                         type: string
 *                       description:
 *                         type: string
 *                       potentialImpact:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH]
 *                       estimatedSavings:
 *                         type: number
 *                         format: float
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 */
router.get(
  '/methods',
  validatePaymentMethodAnalytics,
  paymentAnalyticsController.getPaymentMethodAnalytics.bind(paymentAnalyticsController)
);

/**
 * @swagger
 * /payment-analytics/customer-behavior:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Get customer payment behavior analysis
 *     description: Analyzes customer payment patterns, timing, preferences, and risk factors to improve collections and customer relationship management.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Analyze specific customer (if not provided, analyzes all customers)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [month, quarter, year, all]
 *           default: year
 *         description: Analysis period
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: segmentBy
 *         schema:
 *           type: string
 *           enum: [PAYMENT_BEHAVIOR, AMOUNT_RANGE, FREQUENCY, RISK_LEVEL]
 *           default: PAYMENT_BEHAVIOR
 *         description: How to segment customers
 *       - in: query
 *         name: includeRiskScoring
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include risk scoring analysis
 *       - in: query
 *         name: minTransactions
 *         schema:
 *           type: integer
 *           default: 3
 *         description: Minimum transactions required for analysis
 *     responses:
 *       200:
 *         description: Customer payment behavior analysis retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysisOverview:
 *                   type: object
 *                   properties:
 *                     totalCustomers:
 *                       type: integer
 *                       description: Total customers analyzed
 *                     analysisDate:
 *                       type: string
 *                       format: date-time
 *                     averageCustomerLifetime:
 *                       type: number
 *                       format: float
 *                       description: Average customer lifetime in months
 *                     totalTransactions:
 *                       type: integer
 *                     totalAmount:
 *                       type: number
 *                       format: float
 *                 behaviorSegments:
 *                   type: object
 *                   properties:
 *                     earlyPayers:
 *                       type: object
 *                       properties:
 *                         customerCount:
 *                           type: integer
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         avgPaymentDays:
 *                           type: number
 *                           format: float
 *                         revenue:
 *                           type: number
 *                           format: float
 *                         riskScore:
 *                           type: string
 *                           enum: [LOW, MEDIUM, HIGH]
 *                     onTimePayers:
 *                       type: object
 *                     latePayers:
 *                       type: object
 *                       properties:
 *                         customerCount:
 *                           type: integer
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         avgDelayDays:
 *                           type: number
 *                           format: float
 *                         revenue:
 *                           type: number
 *                           format: float
 *                         riskScore:
 *                           type: string
 *                     defaultRisk:
 *                       type: object
 *                     dormantCustomers:
 *                       type: object
 *                 paymentPatterns:
 *                   type: object
 *                   properties:
 *                     averagePaymentTime:
 *                       type: number
 *                       format: float
 *                       description: Average days to payment
 *                     paymentFrequency:
 *                       type: object
 *                       properties:
 *                         weekly:
 *                           type: integer
 *                         monthly:
 *                           type: integer
 *                         quarterly:
 *                           type: integer
 *                         irregular:
 *                           type: integer
 *                     preferredPaymentDays:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           day:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           percentage:
 *                             type: number
 *                             format: float
 *                     seasonalBehavior:
 *                       type: object
 *                       properties:
 *                         Q1:
 *                           type: object
 *                           properties:
 *                             avgPaymentDays:
 *                               type: number
 *                               format: float
 *                             volume:
 *                               type: integer
 *                         Q2:
 *                           type: object
 *                         Q3:
 *                           type: object
 *                         Q4:
 *                           type: object
 *                 riskAnalysis:
 *                   type: object
 *                   properties:
 *                     riskDistribution:
 *                       type: object
 *                       properties:
 *                         LOW:
 *                           type: integer
 *                         MEDIUM:
 *                           type: integer
 *                         HIGH:
 *                           type: integer
 *                     riskFactors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           factor:
 *                             type: string
 *                           weight:
 *                             type: number
 *                             format: float
 *                           description:
 *                             type: string
 *                     defaultProbability:
 *                       type: number
 *                       format: float
 *                       description: Overall default probability percentage
 *                 customerInsights:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       customerId:
 *                         type: string
 *                       customerName:
 *                         type: string
 *                       behaviorSegment:
 *                         type: string
 *                       riskScore:
 *                         type: string
 *                       avgPaymentDays:
 *                         type: number
 *                         format: float
 *                       totalPaid:
 *                         type: number
 *                         format: float
 *                       paymentCount:
 *                         type: integer
 *                       lastPaymentDate:
 *                         type: string
 *                         format: date
 *                       paymentReliability:
 *                         type: number
 *                         format: float
 *                         description: Reliability score (0-1)
 *                       preferredMethod:
 *                         type: string
 *                       recommendations:
 *                         type: array
 *                         items:
 *                           type: string
 *                   description: Individual customer insights (limited to top/problematic customers)
 *                 actionableInsights:
 *                   type: object
 *                   properties:
 *                     improvementOpportunities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           opportunity:
 *                             type: string
 *                           impact:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH]
 *                           effort:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH]
 *                           description:
 *                             type: string
 *                     collectionsStrategy:
 *                       type: array
 *                       items:
 *                         type: string
 *                     customerRetention:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 */
router.get(
  '/customer-behavior',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateCustomerPaymentBehavior,
  paymentAnalyticsController.getCustomerPaymentBehavior.bind(paymentAnalyticsController)
);

/**
 * @swagger
 * /payment-analytics/forecast:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Get payment forecast
 *     description: Generates predictive analytics for future payment expectations based on historical data, customer behavior, and market trends for financial planning.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: forecastPeriod
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: quarter
 *         description: Period to forecast
 *       - in: query
 *         name: forecastHorizon
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *           default: 3
 *         description: Number of periods to forecast
 *       - in: query
 *         name: modelType
 *         schema:
 *           type: string
 *           enum: [LINEAR, EXPONENTIAL, SEASONAL, ARIMA, ENSEMBLE]
 *           default: ENSEMBLE
 *         description: Forecasting model to use
 *       - in: query
 *         name: includeScenarios
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include optimistic/pessimistic scenarios
 *       - in: query
 *         name: segmentBy
 *         schema:
 *           type: string
 *           enum: [TOTAL, CUSTOMER, PAYMENT_METHOD, INVOICE_TYPE]
 *           default: TOTAL
 *         description: How to segment the forecast
 *       - in: query
 *         name: includeConfidenceIntervals
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include confidence intervals
 *     responses:
 *       200:
 *         description: Payment forecast generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 forecastMetadata:
 *                   type: object
 *                   properties:
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                     modelUsed:
 *                       type: string
 *                     accuracy:
 *                       type: number
 *                       format: float
 *                       description: Model accuracy based on historical validation
 *                     dataPoints:
 *                       type: integer
 *                       description: Number of historical data points used
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                 baseForecast:
 *                   type: object
 *                   properties:
 *                     totalExpectedPayments:
 *                       type: number
 *                       format: float
 *                       description: Total expected payment amount
 *                     expectedTransactionCount:
 *                       type: integer
 *                       description: Expected number of transactions
 *                     averagePaymentAmount:
 *                       type: number
 *                       format: float
 *                     growthRate:
 *                       type: number
 *                       format: float
 *                       description: Expected growth rate percentage
 *                 periodForecasts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         description: Forecast period (e.g., "2024-Q2")
 *                       startDate:
 *                         type: string
 *                         format: date
 *                       endDate:
 *                         type: string
 *                         format: date
 *                       expectedAmount:
 *                         type: number
 *                         format: float
 *                       expectedTransactions:
 *                         type: integer
 *                       confidence:
 *                         type: number
 *                         format: float
 *                         description: Confidence level (0-1)
 *                       confidenceInterval:
 *                         type: object
 *                         properties:
 *                           lower:
 *                             type: number
 *                             format: float
 *                           upper:
 *                             type: number
 *                             format: float
 *                       seasonalFactor:
 *                         type: number
 *                         format: float
 *                         description: Seasonal adjustment factor
 *                   description: Period-by-period forecast details
 *                 scenarios:
 *                   type: object
 *                   properties:
 *                     optimistic:
 *                       type: object
 *                       properties:
 *                         totalAmount:
 *                           type: number
 *                           format: float
 *                         growthRate:
 *                           type: number
 *                           format: float
 *                         probability:
 *                           type: number
 *                           format: float
 *                         assumptions:
 *                           type: array
 *                           items:
 *                             type: string
 *                     pessimistic:
 *                       type: object
 *                       properties:
 *                         totalAmount:
 *                           type: number
 *                           format: float
 *                         growthRate:
 *                           type: number
 *                           format: float
 *                         probability:
 *                           type: number
 *                           format: float
 *                         riskFactors:
 *                           type: array
 *                           items:
 *                             type: string
 *                     mostLikely:
 *                       type: object
 *                       description: Most probable scenario
 *                 segmentForecasts:
 *                   type: object
 *                   properties:
 *                     byPaymentMethod:
 *                       type: object
 *                       properties:
 *                         CASH:
 *                           type: object
 *                           properties:
 *                             expectedAmount:
 *                               type: number
 *                               format: float
 *                             expectedTransactions:
 *                               type: integer
 *                             trend:
 *                               type: string
 *                               enum: [GROWING, STABLE, DECLINING]
 *                         CHEQUE:
 *                           type: object
 *                         BANK_TRANSFER:
 *                           type: object
 *                         CREDIT_CARD:
 *                           type: object
 *                         STRIPE:
 *                           type: object
 *                     byCustomerSegment:
 *                       type: object
 *                       properties:
 *                         enterprise:
 *                           type: object
 *                         smallBusiness:
 *                           type: object
 *                         individual:
 *                           type: object
 *                 riskFactors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       factor:
 *                         type: string
 *                       impact:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH]
 *                       probability:
 *                         type: number
 *                         format: float
 *                       description:
 *                         type: string
 *                   description: Identified risk factors that could affect forecast
 *                 recommendations:
 *                   type: object
 *                   properties:
 *                     cashFlowManagement:
 *                       type: array
 *                       items:
 *                         type: string
 *                     collectionStrategies:
 *                       type: array
 *                       items:
 *                         type: string
 *                     businessPlanning:
 *                       type: array
 *                       items:
 *                         type: string
 *                 modelPerformance:
 *                   type: object
 *                   properties:
 *                     historicalAccuracy:
 *                       type: number
 *                       format: float
 *                       description: Historical forecasting accuracy
 *                     lastValidation:
 *                       type: string
 *                       format: date
 *                     meanAbsoluteError:
 *                       type: number
 *                       format: float
 *                     nextModelUpdate:
 *                       type: string
 *                       format: date
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       400:
 *         description: Invalid query parameters
 *       422:
 *         description: Insufficient historical data for forecasting
 *       500:
 *         description: Internal server error
 */
router.get(
  '/forecast',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validatePaymentForecast,
  paymentAnalyticsController.getPaymentForecast.bind(paymentAnalyticsController)
);

/**
 * @swagger
 * /payment-analytics/cash-flow:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Get cash flow projection
 *     description: Generates detailed cash flow projections based on outstanding invoices, payment patterns, and expected receipts for financial planning and liquidity management.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectionPeriod
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: weekly
 *         description: Granularity of cash flow projection
 *       - in: query
 *         name: horizonDays
 *         schema:
 *           type: integer
 *           minimum: 7
 *           maximum: 365
 *           default: 90
 *         description: Number of days to project into the future
 *       - in: query
 *         name: includeOverdueInvoices
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include overdue invoices in projections
 *       - in: query
 *         name: confidenceLevel
 *         schema:
 *           type: string
 *           enum: [conservative, moderate, optimistic]
 *           default: moderate
 *         description: Confidence level for collection assumptions
 *       - in: query
 *         name: includeSeasonalAdjustments
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to apply seasonal adjustments
 *       - in: query
 *         name: accountForHolidays
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to account for holidays and business days
 *     responses:
 *       200:
 *         description: Cash flow projection generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projectionMetadata:
 *                   type: object
 *                   properties:
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                     projectionPeriod:
 *                       type: string
 *                     horizonDays:
 *                       type: integer
 *                     confidenceLevel:
 *                       type: string
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                     dataQuality:
 *                       type: string
 *                       enum: [HIGH, MEDIUM, LOW]
 *                 currentPosition:
 *                   type: object
 *                   properties:
 *                     currentCashBalance:
 *                       type: number
 *                       format: float
 *                       description: Current available cash
 *                     outstandingReceivables:
 *                       type: number
 *                       format: float
 *                       description: Total outstanding receivables
 *                     overdueAmount:
 *                       type: number
 *                       format: float
 *                       description: Total overdue amount
 *                     nextExpectedReceipt:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           format: float
 *                         expectedDate:
 *                           type: string
 *                           format: date
 *                         probability:
 *                           type: number
 *                           format: float
 *                 projectionSummary:
 *                   type: object
 *                   properties:
 *                     totalExpectedInflows:
 *                       type: number
 *                       format: float
 *                       description: Total expected cash inflows
 *                     projectedEndBalance:
 *                       type: number
 *                       format: float
 *                       description: Projected cash balance at end of period
 *                     minimumBalance:
 *                       type: number
 *                       format: float
 *                       description: Lowest projected balance during period
 *                     maximumBalance:
 *                       type: number
 *                       format: float
 *                       description: Highest projected balance during period
 *                     averageWeeklyInflow:
 *                       type: number
 *                       format: float
 *                 weeklyProjections:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       weekStarting:
 *                         type: string
 *                         format: date
 *                       weekEnding:
 *                         type: string
 *                         format: date
 *                       expectedInflows:
 *                         type: number
 *                         format: float
 *                       projectedBalance:
 *                         type: number
 *                         format: float
 *                       confidenceRange:
 *                         type: object
 *                         properties:
 *                           lower:
 *                             type: number
 *                             format: float
 *                           upper:
 *                             type: number
 *                             format: float
 *                       majorReceipts:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             customerId:
 *                               type: string
 *                             customerName:
 *                               type: string
 *                             amount:
 *                               type: number
 *                               format: float
 *                             expectedDate:
 *                               type: string
 *                               format: date
 *                             probability:
 *                               type: number
 *                               format: float
 *                             invoiceId:
 *                               type: string
 *                       riskFactors:
 *                         type: array
 *                         items:
 *                           type: string
 *                   description: Week-by-week cash flow projections
 *                 paymentPatternAnalysis:
 *                   type: object
 *                   properties:
 *                     averageCollectionDays:
 *                       type: number
 *                       format: float
 *                       description: Average days to collect payment
 *                     collectionEfficiency:
 *                       type: number
 *                       format: float
 *                       description: Collection efficiency percentage
 *                     seasonalFactors:
 *                       type: object
 *                       properties:
 *                         Q1Factor:
 *                           type: number
 *                           format: float
 *                         Q2Factor:
 *                           type: number
 *                           format: float
 *                         Q3Factor:
 *                           type: number
 *                           format: float
 *                         Q4Factor:
 *                           type: number
 *                           format: float
 *                     holidayImpact:
 *                       type: object
 *                       properties:
 *                         delayDays:
 *                           type: integer
 *                         affectedPeriods:
 *                           type: array
 *                           items:
 *                             type: string
 *                             format: date
 *                 riskAnalysis:
 *                   type: object
 *                   properties:
 *                     cashFlowRisks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           riskType:
 *                             type: string
 *                             enum: [CUSTOMER_DEFAULT, SEASONAL_DOWNTURN, ECONOMIC_FACTORS, COLLECTION_DELAYS]
 *                           impact:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                           probability:
 *                             type: number
 *                             format: float
 *                           description:
 *                             type: string
 *                           mitigation:
 *                             type: string
 *                     stressTestScenarios:
 *                       type: object
 *                       properties:
 *                         bearCase:
 *                           type: object
 *                           properties:
 *                             projectedBalance:
 *                               type: number
 *                               format: float
 *                             shortfall:
 *                               type: number
 *                               format: float
 *                             description:
 *                               type: string
 *                         worstCase:
 *                           type: object
 *                 recommendations:
 *                   type: object
 *                   properties:
 *                     liquidityManagement:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action:
 *                             type: string
 *                           priority:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH, URGENT]
 *                           description:
 *                             type: string
 *                           estimatedImpact:
 *                             type: number
 *                             format: float
 *                     collectionActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     financingOptions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           option:
 *                             type: string
 *                           amount:
 *                             type: number
 *                             format: float
 *                           cost:
 *                             type: number
 *                             format: float
 *                           timeframe:
 *                             type: string
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [LOW_BALANCE_WARNING, NEGATIVE_PROJECTION, LARGE_RECEIPT_DELAY, SEASONAL_IMPACT]
 *                       severity:
 *                         type: string
 *                         enum: [INFO, WARNING, CRITICAL]
 *                       date:
 *                         type: string
 *                         format: date
 *                       description:
 *                         type: string
 *                       recommendedAction:
 *                         type: string
 *                   description: Cash flow alerts and warnings
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       400:
 *         description: Invalid query parameters
 *       422:
 *         description: Insufficient data for accurate projection
 *       500:
 *         description: Internal server error
 */
router.get(
  '/cash-flow',
  authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT),
  validateCashFlowProjection,
  paymentAnalyticsController.getCashFlowProjection.bind(paymentAnalyticsController)
);

/**
 * @swagger
 * /payment-analytics/aging:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Get payment aging report
 *     description: Generates accounts receivable aging report showing outstanding invoices categorized by days overdue, essential for collections management and financial reporting.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for aging calculation (defaults to current date)
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by specific customer
 *       - in: query
 *         name: includeCredits
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include customer credits in calculations
 *       - in: query
 *         name: agingBuckets
 *         schema:
 *           type: string
 *           enum: [standard, detailed, custom]
 *           default: standard
 *         description: Aging bucket configuration (0-30, 31-60, 61-90, 90+)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [customer_name, total_outstanding, days_overdue, last_payment]
 *           default: total_outstanding
 *         description: Sort order for results
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *           format: float
 *           default: 0.01
 *         description: Minimum outstanding amount to include
 *     responses:
 *       200:
 *         description: Payment aging report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reportMetadata:
 *                   type: object
 *                   properties:
 *                     asOfDate:
 *                       type: string
 *                       format: date
 *                       description: Date as of which aging is calculated
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                     totalCustomers:
 *                       type: integer
 *                       description: Total customers with outstanding balances
 *                     totalInvoices:
 *                       type: integer
 *                       description: Total outstanding invoices
 *                     reportCurrency:
 *                       type: string
 *                       example: "CAD"
 *                 agingSummary:
 *                   type: object
 *                   properties:
 *                     totalOutstanding:
 *                       type: number
 *                       format: float
 *                       description: Total outstanding receivables
 *                     current:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         invoiceCount:
 *                           type: integer
 *                       description: Current (0-30 days)
 *                     days31to60:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         invoiceCount:
 *                           type: integer
 *                       description: 31-60 days overdue
 *                     days61to90:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         invoiceCount:
 *                           type: integer
 *                       description: 61-90 days overdue
 *                     over90Days:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           format: float
 *                         percentage:
 *                           type: number
 *                           format: float
 *                         invoiceCount:
 *                           type: integer
 *                       description: Over 90 days overdue
 *                 customerAging:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       customerId:
 *                         type: string
 *                       customerName:
 *                         type: string
 *                       customerEmail:
 *                         type: string
 *                       totalOutstanding:
 *                         type: number
 *                         format: float
 *                       current:
 *                         type: number
 *                         format: float
 *                       days31to60:
 *                         type: number
 *                         format: float
 *                       days61to90:
 *                         type: number
 *                         format: float
 *                       over90Days:
 *                         type: number
 *                         format: float
 *                       lastPaymentDate:
 *                         type: string
 *                         format: date
 *                       lastPaymentAmount:
 *                         type: number
 *                         format: float
 *                       oldestInvoiceDate:
 *                         type: string
 *                         format: date
 *                       daysSinceOldest:
 *                         type: integer
 *                       paymentHistory:
 *                         type: object
 *                         properties:
 *                           averagePaymentDays:
 *                             type: number
 *                             format: float
 *                           onTimePaymentRate:
 *                             type: number
 *                             format: float
 *                       creditLimit:
 *                         type: number
 *                         format: float
 *                       availableCredit:
 *                         type: number
 *                         format: float
 *                       riskLevel:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                   description: Customer-by-customer aging breakdown
 *                 invoiceDetails:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       invoiceId:
 *                         type: string
 *                       invoiceNumber:
 *                         type: string
 *                       customerId:
 *                         type: string
 *                       customerName:
 *                         type: string
 *                       invoiceDate:
 *                         type: string
 *                         format: date
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       originalAmount:
 *                         type: number
 *                         format: float
 *                       outstandingAmount:
 *                         type: number
 *                         format: float
 *                       daysOverdue:
 *                         type: integer
 *                       agingBucket:
 *                         type: string
 *                         enum: [CURRENT, DAYS_31_60, DAYS_61_90, OVER_90]
 *                       lastPaymentDate:
 *                         type: string
 *                         format: date
 *                       paymentTerms:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [PENDING, SENT, VIEWED, PAID, OVERDUE, CANCELLED]
 *                   description: Individual invoice aging details
 *                 collectionsAnalysis:
 *                   type: object
 *                   properties:
 *                     urgentActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           customerId:
 *                             type: string
 *                           customerName:
 *                             type: string
 *                           amount:
 *                             type: number
 *                             format: float
 *                           daysOverdue:
 *                             type: integer
 *                           recommendedAction:
 *                             type: string
 *                           priority:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH, URGENT]
 *                       description: Customers requiring immediate attention
 *                     collectionOpportunities:
 *                       type: object
 *                       properties:
 *                         high90Plus:
 *                           type: number
 *                           format: float
 *                           description: High-value accounts over 90 days
 *                         frequentLate:
 *                           type: integer
 *                           description: Customers with pattern of late payments
 *                         potentialWriteOffs:
 *                           type: number
 *                           format: float
 *                           description: Amount at risk of write-off
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [FOLLOW_UP, PAYMENT_PLAN, COLLECTION_AGENCY, WRITE_OFF, CREDIT_HOLD]
 *                           description:
 *                             type: string
 *                           priority:
 *                             type: string
 *                           estimatedImpact:
 *                             type: number
 *                             format: float
 *                 trendAnalysis:
 *                   type: object
 *                   properties:
 *                     monthOverMonth:
 *                       type: object
 *                       properties:
 *                         totalChange:
 *                           type: number
 *                           format: float
 *                         percentageChange:
 *                           type: number
 *                           format: float
 *                         trendDirection:
 *                           type: string
 *                           enum: [IMPROVING, WORSENING, STABLE]
 *                     yearOverYear:
 *                       type: object
 *                     dsoTrend:
 *                       type: object
 *                       properties:
 *                         currentDSO:
 *                           type: number
 *                           format: float
 *                           description: Current Days Sales Outstanding
 *                         previousDSO:
 *                           type: number
 *                           format: float
 *                         targetDSO:
 *                           type: number
 *                           format: float
 *                         variance:
 *                           type: number
 *                           format: float
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 */
router.get(
  '/aging',
  paymentAnalyticsController.getPaymentAging.bind(paymentAnalyticsController)
);

/**
 * @swagger
 * /payment-analytics/fraud-alerts:
 *   get:
 *     tags: [Payment Analytics]
 *     summary: Detect fraud alerts
 *     description: Analyzes payment patterns and transactions to identify potential fraudulent activities, suspicious behavior, and security risks for proactive fraud prevention.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: week
 *         description: Time period for fraud detection analysis
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: severityLevel
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *           default: MEDIUM
 *         description: Minimum severity level to include
 *       - in: query
 *         name: alertTypes
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [UNUSUAL_AMOUNT, RAPID_FREQUENCY, GEOGRAPHIC_ANOMALY, TIME_ANOMALY, PAYMENT_METHOD_ABUSE, DUPLICATE_DETECTION]
 *         description: Specific types of fraud alerts to check
 *       - in: query
 *         name: includeResolved
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to include previously resolved alerts
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Focus analysis on specific customer
 *     responses:
 *       200:
 *         description: Fraud detection analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 detectionMetadata:
 *                   type: object
 *                   properties:
 *                     analysisDate:
 *                       type: string
 *                       format: date-time
 *                     analysisRange:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date
 *                         endDate:
 *                           type: string
 *                           format: date
 *                     transactionsAnalyzed:
 *                       type: integer
 *                       description: Total transactions analyzed
 *                     modelsUsed:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Fraud detection models applied
 *                     lastModelUpdate:
 *                       type: string
 *                       format: date-time
 *                 alertSummary:
 *                   type: object
 *                   properties:
 *                     totalAlerts:
 *                       type: integer
 *                       description: Total fraud alerts detected
 *                     newAlerts:
 *                       type: integer
 *                       description: New alerts since last check
 *                     criticalAlerts:
 *                       type: integer
 *                       description: Critical severity alerts
 *                     averageRiskScore:
 *                       type: number
 *                       format: float
 *                       description: Average risk score (0-100)
 *                     estimatedExposure:
 *                       type: number
 *                       format: float
 *                       description: Estimated financial exposure
 *                 activeAlerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       alertId:
 *                         type: string
 *                         description: Unique alert identifier
 *                       alertType:
 *                         type: string
 *                         enum: [UNUSUAL_AMOUNT, RAPID_FREQUENCY, GEOGRAPHIC_ANOMALY, TIME_ANOMALY, PAYMENT_METHOD_ABUSE, DUPLICATE_DETECTION, VELOCITY_CHECK, BEHAVIORAL_ANOMALY]
 *                         description: Type of fraud detected
 *                       severity:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                       riskScore:
 *                         type: number
 *                         format: float
 *                         description: Risk score (0-100)
 *                       detectedAt:
 *                         type: string
 *                         format: date-time
 *                       customerId:
 *                         type: string
 *                       customerName:
 *                         type: string
 *                       transactionId:
 *                         type: string
 *                       paymentMethod:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         format: float
 *                       suspiciousIndicators:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             indicator:
 *                               type: string
 *                             value:
 *                               type: string
 *                             threshold:
 *                               type: string
 *                             severity:
 *                               type: string
 *                       description:
 *                         type: string
 *                         description: Detailed description of the alert
 *                       recommendedActions:
 *                         type: array
 *                         items:
 *                           type: string
 *                       status:
 *                         type: string
 *                         enum: [NEW, INVESTIGATING, CONFIRMED, FALSE_POSITIVE, RESOLVED]
 *                       assignedTo:
 *                         type: string
 *                         description: User assigned to investigate
 *                       relatedAlerts:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Related alert IDs
 *                   description: Active fraud alerts requiring attention
 *                 patternAnalysis:
 *                   type: object
 *                   properties:
 *                     suspiciousPatterns:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           patternType:
 *                             type: string
 *                             enum: [CARD_TESTING, ACCOUNT_TAKEOVER, SYNTHETIC_IDENTITY, FRIENDLY_FRAUD, MERCHANT_FRAUD]
 *                           frequency:
 *                             type: integer
 *                           confidence:
 *                             type: number
 *                             format: float
 *                           description:
 *                             type: string
 *                           affectedCustomers:
 *                             type: integer
 *                           totalAmount:
 *                             type: number
 *                             format: float
 *                     geographicAnomalies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           location:
 *                             type: string
 *                           unusualActivity:
 *                             type: string
 *                           riskLevel:
 *                             type: string
 *                     timeAnomalies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timePattern:
 *                             type: string
 *                           deviation:
 *                             type: string
 *                           frequency:
 *                             type: integer
 *                 riskMetrics:
 *                   type: object
 *                   properties:
 *                     overallRiskLevel:
 *                       type: string
 *                       enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                     fraudRate:
 *                       type: number
 *                       format: float
 *                       description: Fraud rate percentage
 *                     falsePositiveRate:
 *                       type: number
 *                       format: float
 *                       description: False positive rate percentage
 *                     detectionAccuracy:
 *                       type: number
 *                       format: float
 *                       description: Model detection accuracy
 *                     averageDetectionTime:
 *                       type: number
 *                       format: float
 *                       description: Average time to detect fraud (hours)
 *                 preventionMetrics:
 *                   type: object
 *                   properties:
 *                     blockedTransactions:
 *                       type: integer
 *                       description: Transactions blocked due to fraud detection
 *                     savedAmount:
 *                       type: number
 *                       format: float
 *                       description: Estimated amount saved from fraud prevention
 *                     falseBlocks:
 *                       type: integer
 *                       description: Legitimate transactions incorrectly blocked
 *                     customerImpact:
 *                       type: object
 *                       properties:
 *                         affectedCustomers:
 *                           type: integer
 *                         customerComplaints:
 *                           type: integer
 *                         resolutionTime:
 *                           type: number
 *                           format: float
 *                           description: Average resolution time in hours
 *                 recommendations:
 *                   type: object
 *                   properties:
 *                     immediate:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action:
 *                             type: string
 *                           priority:
 *                             type: string
 *                             enum: [LOW, MEDIUM, HIGH, URGENT]
 *                           description:
 *                             type: string
 *                           estimatedImpact:
 *                             type: string
 *                       description: Immediate actions required
 *                     preventive:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Preventive measures to implement
 *                     systemImprovements:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: System and process improvements
 *                 compliance:
 *                   type: object
 *                   properties:
 *                     reportingRequired:
 *                       type: boolean
 *                       description: Whether regulatory reporting is required
 *                     regulatoryAlerts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           regulation:
 *                             type: string
 *                           requirement:
 *                             type: string
 *                           deadline:
 *                             type: string
 *                             format: date
 *                     auditTrail:
 *                       type: object
 *                       properties:
 *                         documented:
 *                           type: boolean
 *                         retentionPeriod:
 *                           type: string
 *                         accessLog:
 *                           type: array
 *                           items:
 *                             type: object
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - Requires Admin or Manager role
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 */
router.get(
  '/fraud-alerts',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validateFraudAlerts,
  paymentAnalyticsController.detectFraudAlerts.bind(paymentAnalyticsController)
);

export default router;