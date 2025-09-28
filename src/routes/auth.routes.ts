import { Router, Request, Response } from 'express';
import {
  authController,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateResetPassword
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     description: Creates a new user account with email verification. Registration requires organization invitation or valid organization domain for multi-tenant security.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - organizationId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address (must be unique)
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 description: User password (min 8 chars, must include uppercase, lowercase, number, special char)
 *                 example: "SecurePass123!"
 *                 minLength: 8
 *                 pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"
 *               firstName:
 *                 type: string
 *                 description: User's first name
 *                 example: "John"
 *                 minLength: 2
 *                 maxLength: 50
 *               lastName:
 *                 type: string
 *                 description: User's last name
 *                 example: "Doe"
 *                 minLength: 2
 *                 maxLength: 50
 *               organizationId:
 *                 type: string
 *                 description: Organization ID to join
 *                 example: "clp1234567890"
 *               invitationCode:
 *                 type: string
 *                 description: Invitation code (required for some organizations)
 *                 example: "INV-ABC123"
 *               role:
 *                 type: string
 *                 enum: [VIEWER, EMPLOYEE, ACCOUNTANT, MANAGER, ADMIN]
 *                 description: Requested role (subject to approval)
 *                 example: "EMPLOYEE"
 *               phone:
 *                 type: string
 *                 description: Phone number for 2FA and notifications
 *                 example: "+1-555-123-4567"
 *               timezone:
 *                 type: string
 *                 description: User's timezone
 *                 example: "America/New_York"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered successfully. Please check your email for verification."
 *                 userId:
 *                   type: string
 *                   description: Created user ID
 *                 email:
 *                   type: string
 *                 verificationRequired:
 *                   type: boolean
 *                   description: Whether email verification is required
 *                 estimatedActivationTime:
 *                   type: string
 *                   description: Estimated time for account activation
 *       400:
 *         description: Invalid input data or validation errors
 *       409:
 *         description: Conflict - Email already exists or organization invitation required
 *       500:
 *         description: Internal server error
 */
router.post('/register', validateRegister, (req: Request, res: Response) => authController.register(req, res));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate user
 *     description: Authenticates user credentials and returns JWT access and refresh tokens. Supports multi-factor authentication and tracks login sessions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 description: User password
 *                 example: "SecurePass123!"
 *               organizationId:
 *                 type: string
 *                 description: Optional organization ID for multi-tenant users
 *                 example: "clp1234567890"
 *               rememberMe:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to extend session duration
 *               twoFactorCode:
 *                 type: string
 *                 description: Two-factor authentication code (if enabled)
 *                 example: "123456"
 *                 pattern: "^[0-9]{6}$"
 *               deviceInfo:
 *                 type: object
 *                 properties:
 *                   deviceName:
 *                     type: string
 *                     example: "John's MacBook Pro"
 *                   userAgent:
 *                     type: string
 *                   ipAddress:
 *                     type: string
 *                     format: ipv4
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token (15 minutes expiry)
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token (30 days expiry)
 *                 tokenType:
 *                   type: string
 *                   example: "Bearer"
 *                 expiresIn:
 *                   type: integer
 *                   description: Access token expiry in seconds
 *                   example: 900
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER]
 *                     organizationId:
 *                       type: string
 *                     lastLoginAt:
 *                       type: string
 *                       format: date-time
 *                     twoFactorEnabled:
 *                       type: boolean
 *                 sessionId:
 *                   type: string
 *                   description: Session identifier for logout operations
 *       400:
 *         description: Invalid credentials or validation errors
 *       401:
 *         description: Authentication failed - invalid email/password
 *       403:
 *         description: Account locked, suspended, or requires verification
 *       423:
 *         description: Account temporarily locked due to failed attempts
 *       500:
 *         description: Internal server error
 */
router.post('/login', validateLogin, (req: Request, res: Response) => authController.login(req, res));

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token
 *     description: Generates a new access token using a valid refresh token. Essential for maintaining authenticated sessions without re-login.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid JWT refresh token
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: New JWT access token
 *                 tokenType:
 *                   type: string
 *                   example: "Bearer"
 *                 expiresIn:
 *                   type: integer
 *                   description: Access token expiry in seconds
 *                   example: 900
 *                 refreshToken:
 *                   type: string
 *                   description: New refresh token (if rotation enabled)
 *       400:
 *         description: Invalid or missing refresh token
 *       401:
 *         description: Refresh token expired or revoked
 *       500:
 *         description: Internal server error
 */
router.post('/refresh', (req: Request, res: Response) => authController.refreshToken(req, res));

/**
 * @swagger
 * /auth/reset-password-request:
 *   post:
 *     tags: [Authentication]
 *     summary: Request password reset
 *     description: Initiates password reset process by sending a secure reset link to the user's email. Includes rate limiting to prevent abuse.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the account to reset
 *                 example: "john.doe@example.com"
 *               organizationId:
 *                 type: string
 *                 description: Organization ID (for multi-tenant users)
 *                 example: "clp1234567890"
 *     responses:
 *       200:
 *         description: Reset email sent (returns success even if email doesn't exist for security)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "If an account with that email exists, a password reset link has been sent."
 *                 resetTokenExpiresIn:
 *                   type: integer
 *                   description: Reset token expiry in minutes
 *                   example: 60
 *       400:
 *         description: Invalid email format
 *       429:
 *         description: Too many reset requests - rate limited
 *       500:
 *         description: Internal server error
 */
router.post('/reset-password-request', (req: Request, res: Response) => authController.resetPasswordRequest(req, res));

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Reset password
 *     description: Completes password reset process using the token received via email. The token is single-use and has limited validity.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token from email
 *                 example: "abc123def456ghi789"
 *               newPassword:
 *                 type: string
 *                 description: New password (must meet security requirements)
 *                 example: "NewSecurePass123!"
 *                 minLength: 8
 *                 pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"
 *               confirmPassword:
 *                 type: string
 *                 description: Password confirmation (must match newPassword)
 *                 example: "NewSecurePass123!"
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password reset successfully. Please log in with your new password."
 *                 userId:
 *                   type: string
 *                   description: User ID for reference
 *                 resetCompletedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid token, password mismatch, or weak password
 *       401:
 *         description: Reset token expired or already used
 *       500:
 *         description: Internal server error
 */
router.post('/reset-password', validateResetPassword, (req: Request, res: Response) => authController.resetPassword(req, res));

// Protected routes - require authentication
router.use(authenticate);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout current session
 *     description: Invalidates the current session by blacklisting the access token and removing the refresh token. Logs the logout event for security auditing.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Optional session ID to logout (defaults to current session)
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logout successful"
 *                 loggedOutAt:
 *                   type: string
 *                   format: date-time
 *                 sessionId:
 *                   type: string
 *                   description: ID of the logged out session
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.post('/logout', (req: Request, res: Response) => authController.logout(req as any, res));

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout all sessions
 *     description: Invalidates all active sessions for the current user across all devices. Useful for security incidents or when changing passwords.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All sessions logged out successfully"
 *                 sessionsTerminated:
 *                   type: integer
 *                   description: Number of sessions that were terminated
 *                   example: 3
 *                 loggedOutAt:
 *                   type: string
 *                   format: date-time
 *                 devicesSummary:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       deviceName:
 *                         type: string
 *                       lastActive:
 *                         type: string
 *                         format: date-time
 *                       location:
 *                         type: string
 *                   description: Summary of devices that were logged out
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.post('/logout-all', (req: Request, res: Response) => authController.logoutAll(req as any, res));

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Change user password
 *     description: Changes the current user's password. Requires current password verification and logs out all other sessions for security.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password for verification
 *                 example: "CurrentPass123!"
 *               newPassword:
 *                 type: string
 *                 description: New password (must meet security requirements)
 *                 example: "NewSecurePass123!"
 *                 minLength: 8
 *                 pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"
 *               confirmPassword:
 *                 type: string
 *                 description: Password confirmation (must match newPassword)
 *                 example: "NewSecurePass123!"
 *               logoutOtherSessions:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to logout other active sessions
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *                 changedAt:
 *                   type: string
 *                   format: date-time
 *                 otherSessionsLoggedOut:
 *                   type: boolean
 *                   description: Whether other sessions were logged out
 *                 sessionsTerminated:
 *                   type: integer
 *                   description: Number of other sessions terminated
 *                 newTokens:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: New access token for continued use
 *                     refreshToken:
 *                       type: string
 *                       description: New refresh token
 *                     expiresIn:
 *                       type: integer
 *       400:
 *         description: Invalid input data, password mismatch, or weak password
 *       401:
 *         description: Current password is incorrect
 *       403:
 *         description: Password change not allowed (e.g., recently changed)
 *       500:
 *         description: Internal server error
 */
router.post('/change-password', validateChangePassword, (req: Request, res: Response) => authController.changePassword(req as any, res));

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     tags: [Authentication]
 *     summary: Get user profile
 *     description: Retrieves the current user's profile information including personal details, preferences, and account settings.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: User ID
 *                 email:
 *                   type: string
 *                   format: email
 *                   example: "john.doe@example.com"
 *                 firstName:
 *                   type: string
 *                   example: "John"
 *                 lastName:
 *                   type: string
 *                   example: "Doe"
 *                 role:
 *                   type: string
 *                   enum: [SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER]
 *                   example: "EMPLOYEE"
 *                 organizationId:
 *                   type: string
 *                 organization:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       example: "Acme Corporation"
 *                     domain:
 *                       type: string
 *                       example: "acme.com"
 *                 phone:
 *                   type: string
 *                   example: "+1-555-123-4567"
 *                 timezone:
 *                   type: string
 *                   example: "America/New_York"
 *                 preferences:
 *                   type: object
 *                   properties:
 *                     language:
 *                       type: string
 *                       example: "en"
 *                     dateFormat:
 *                       type: string
 *                       example: "MM/DD/YYYY"
 *                     timeFormat:
 *                       type: string
 *                       example: "12h"
 *                     notifications:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: boolean
 *                         sms:
 *                           type: boolean
 *                         push:
 *                           type: boolean
 *                 security:
 *                   type: object
 *                   properties:
 *                     twoFactorEnabled:
 *                       type: boolean
 *                     lastPasswordChange:
 *                       type: string
 *                       format: date-time
 *                     activeSessions:
 *                       type: integer
 *                       description: Number of active sessions
 *                 accountStatus:
 *                   type: string
 *                   enum: [ACTIVE, PENDING, SUSPENDED, DEACTIVATED]
 *                   example: "ACTIVE"
 *                 emailVerified:
 *                   type: boolean
 *                 phoneVerified:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 lastLoginAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get('/profile', (req: Request, res: Response) => authController.getProfile(req as any, res));

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     tags: [Authentication]
 *     summary: Update user profile
 *     description: Updates the current user's profile information including personal details and preferences. Some fields may require additional verification.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: User's first name
 *                 example: "John"
 *                 minLength: 2
 *                 maxLength: 50
 *               lastName:
 *                 type: string
 *                 description: User's last name
 *                 example: "Doe"
 *                 minLength: 2
 *                 maxLength: 50
 *               phone:
 *                 type: string
 *                 description: Phone number (requires verification if changed)
 *                 example: "+1-555-123-4567"
 *               timezone:
 *                 type: string
 *                 description: User's timezone
 *                 example: "America/Los_Angeles"
 *               preferences:
 *                 type: object
 *                 properties:
 *                   language:
 *                     type: string
 *                     enum: ["en", "es", "fr", "de"]
 *                     example: "en"
 *                   dateFormat:
 *                     type: string
 *                     enum: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]
 *                     example: "MM/DD/YYYY"
 *                   timeFormat:
 *                     type: string
 *                     enum: ["12h", "24h"]
 *                     example: "12h"
 *                   notifications:
 *                     type: object
 *                     properties:
 *                       email:
 *                         type: boolean
 *                       sms:
 *                         type: boolean
 *                       push:
 *                         type: boolean
 *               avatar:
 *                 type: string
 *                 format: uri
 *                 description: Avatar image URL
 *               bio:
 *                 type: string
 *                 description: User biography or description
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Profile updated successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     timezone:
 *                       type: string
 *                     preferences:
 *                       type: object
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 verificationRequired:
 *                   type: object
 *                   properties:
 *                     phone:
 *                       type: boolean
 *                       description: Whether phone verification is required
 *                     email:
 *                       type: boolean
 *                       description: Whether email verification is required
 *                 changes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       previousValue:
 *                         type: string
 *                       newValue:
 *                         type: string
 *                   description: Summary of changes made
 *       400:
 *         description: Invalid input data or validation errors
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       409:
 *         description: Conflict - Phone number already in use by another account
 *       500:
 *         description: Internal server error
 */
router.put('/profile', (req: Request, res: Response) => authController.updateProfile(req as any, res));

/**
 * @swagger
 * /auth/2fa/enable:
 *   post:
 *     tags: [Authentication]
 *     summary: Enable two-factor authentication
 *     description: Enables 2FA for the current user account. Returns QR code and backup codes for authentication app setup. Requires password confirmation.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for verification
 *                 example: "CurrentPass123!"
 *               method:
 *                 type: string
 *                 enum: ["app", "sms"]
 *                 default: "app"
 *                 description: 2FA method preference
 *     responses:
 *       200:
 *         description: 2FA setup initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Two-factor authentication setup initiated"
 *                 qrCodeUrl:
 *                   type: string
 *                   description: QR code URL for authentication app
 *                   example: "otpauth://totp/AccountingAPI:john.doe@example.com?secret=..."
 *                 qrCodeImage:
 *                   type: string
 *                   description: Base64 encoded QR code image
 *                 secret:
 *                   type: string
 *                   description: Manual entry secret key (if QR code can't be scanned)
 *                   example: "JBSWY3DPEHPK3PXP"
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: One-time backup codes for recovery
 *                   example: ["12345678", "87654321", "11223344"]
 *                 nextStep:
 *                   type: string
 *                   description: Instructions for completing setup
 *                   example: "Scan QR code with authenticator app and verify with generated code"
 *       400:
 *         description: Invalid password or 2FA already enabled
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.post('/2fa/enable', (req: Request, res: Response) => authController.enableTwoFactor(req as any, res));

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify two-factor authentication
 *     description: Verifies 2FA setup by confirming the code from authenticator app. Completes 2FA enablement and provides new recovery codes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: 6-digit code from authenticator app
 *                 example: "123456"
 *                 pattern: "^[0-9]{6}$"
 *               backupCode:
 *                 type: string
 *                 description: Backup code (alternative to app code)
 *                 example: "12345678"
 *     responses:
 *       200:
 *         description: 2FA verified and enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Two-factor authentication enabled successfully"
 *                 enabled:
 *                   type: boolean
 *                   example: true
 *                 enabledAt:
 *                   type: string
 *                   format: date-time
 *                 method:
 *                   type: string
 *                   example: "app"
 *                 recoveryCodesRemaining:
 *                   type: integer
 *                   description: Number of unused backup codes
 *                   example: 10
 *                 newTokens:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: New access token with 2FA flag
 *                     refreshToken:
 *                       type: string
 *                   description: Updated tokens reflecting 2FA status
 *       400:
 *         description: Invalid or expired code
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       409:
 *         description: 2FA not in setup state or already enabled
 *       500:
 *         description: Internal server error
 */
router.post('/2fa/verify', (req: Request, res: Response) => authController.verifyTwoFactor(req as any, res));

/**
 * @swagger
 * /auth/2fa/disable:
 *   post:
 *     tags: [Authentication]
 *     summary: Disable two-factor authentication
 *     description: Disables 2FA for the current user account. Requires password confirmation and either 2FA code or backup code for security.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for verification
 *                 example: "CurrentPass123!"
 *               code:
 *                 type: string
 *                 description: 6-digit code from authenticator app
 *                 example: "123456"
 *                 pattern: "^[0-9]{6}$"
 *               backupCode:
 *                 type: string
 *                 description: Backup code (alternative to app code)
 *                 example: "12345678"
 *               reason:
 *                 type: string
 *                 description: Optional reason for disabling 2FA
 *                 example: "Lost authenticator device"
 *                 maxLength: 200
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Two-factor authentication disabled successfully"
 *                 disabled:
 *                   type: boolean
 *                   example: true
 *                 disabledAt:
 *                   type: string
 *                   format: date-time
 *                 reason:
 *                   type: string
 *                   description: Reason provided for disabling
 *                 security:
 *                   type: object
 *                   properties:
 *                     otherSessionsLoggedOut:
 *                       type: boolean
 *                       description: Whether other sessions were logged out for security
 *                     sessionsTerminated:
 *                       type: integer
 *                       description: Number of sessions terminated
 *                 newTokens:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: New access token without 2FA flag
 *                     refreshToken:
 *                       type: string
 *                   description: Updated tokens reflecting new 2FA status
 *       400:
 *         description: Invalid password, code, or 2FA not enabled
 *       401:
 *         description: Unauthorized - Invalid authentication or verification failed
 *       500:
 *         description: Internal server error
 */
router.post('/2fa/disable', (req: Request, res: Response) => authController.disableTwoFactor(req as any, res));

export default router;