import { z } from 'zod';

// Base validation schemas
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .transform(val => val.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

export const strongPasswordSchema = passwordSchema
  .min(12, 'Password must be at least 12 characters for enhanced security')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, one special character, and be at least 12 characters long'
  );

export const tokenSchema = z
  .string()
  .min(10, 'Token must be at least 10 characters')
  .max(1000, 'Token must not exceed 1000 characters');

export const twoFactorTokenSchema = z
  .string()
  .transform(val => val.trim())
  .pipe(z.string().regex(/^\d{6}$/, 'Two-factor token must be exactly 6 digits'));

export const ipAddressSchema = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
    'Invalid IP address format'
  );

// Authentication request schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
  twoFactorToken: twoFactorTokenSchema.optional()
});

export const refreshTokenSchema = z.object({
  refreshToken: tokenSchema
});

export const logoutSchema = z.object({
  refreshToken: tokenSchema.optional(),
  allDevices: z.boolean().optional().default(false)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required')
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'New password confirmation does not match',
    path: ['confirmPassword']
  }
).refine(
  (data) => data.currentPassword !== data.newPassword,
  {
    message: 'New password must be different from current password',
    path: ['newPassword']
  }
);

export const resetPasswordRequestSchema = z.object({
  email: emailSchema
});

export const resetPasswordConfirmSchema = z.object({
  token: tokenSchema,
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required')
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Password confirmation does not match',
    path: ['confirmPassword']
  }
);

export const verifyEmailSchema = z.object({
  token: tokenSchema
});

export const resendVerificationSchema = z.object({
  email: emailSchema
});

export const setupTwoFactorSchema = z.object({
  password: z.string().min(1, 'Password is required for 2FA setup')
});

export const verifyTwoFactorSchema = z.object({
  token: twoFactorTokenSchema.optional(),
  backupCode: z.string().optional()
}).refine(
  (data) => data.token || data.backupCode,
  {
    message: 'Either token or backup code is required',
    path: ['token']
  }
);

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, 'Password is required to disable 2FA'),
  token: twoFactorTokenSchema.optional(),
  backupCode: z.string().optional()
}).refine(
  (data) => data.token || data.backupCode,
  {
    message: 'Either token or backup code is required',
    path: ['token']
  }
);

export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must not exceed 50 characters')
    .regex(/^[a-zA-Z\s\-']+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
    .transform(val => val.trim()),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must not exceed 50 characters')
    .regex(/^[a-zA-Z\s\-']+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
    .transform(val => val.trim()),
  phone: z
    .string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  timezone: z
    .string()
    .min(1, 'Timezone is required')
    .max(50, 'Timezone must not exceed 50 characters')
    .optional(),
  language: z
    .enum(['en', 'fr', 'es', 'de'])
    .optional()
    .default('en'),
  notifications: z.object({
    email: z.boolean().default(true),
    sms: z.boolean().default(false),
    push: z.boolean().default(true),
    marketing: z.boolean().default(false)
  }).optional()
});

// Session and device management
export const deviceInfoSchema = z.object({
  deviceName: z.string().max(100, 'Device name must not exceed 100 characters').optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet', 'other']).optional(),
  browser: z.string().max(100, 'Browser info must not exceed 100 characters').optional(),
  os: z.string().max(100, 'OS info must not exceed 100 characters').optional()
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format')
});

export const revokeAllSessionsSchema = z.object({
  password: z.string().min(1, 'Password is required to revoke all sessions')
});

// Admin authentication schemas
export const impersonateUserSchema = z.object({
  targetUserId: z.string().uuid('Invalid user ID format'),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500, 'Reason must not exceed 500 characters')
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'Name must not exceed 100 characters'),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
  expiresAt: z.string().datetime('Invalid expiration date format').optional(),
  ipRestrictions: z.array(ipAddressSchema).max(10, 'Maximum 10 IP restrictions allowed').optional()
});

export const revokeApiKeySchema = z.object({
  keyId: z.string().uuid('Invalid API key ID format')
});

// Type exports for TypeScript
export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordConfirm = z.infer<typeof resetPasswordConfirmSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationRequest = z.infer<typeof resendVerificationSchema>;
export type SetupTwoFactorRequest = z.infer<typeof setupTwoFactorSchema>;
export type VerifyTwoFactorRequest = z.infer<typeof verifyTwoFactorSchema>;
export type DisableTwoFactorRequest = z.infer<typeof disableTwoFactorSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
export type RevokeSessionRequest = z.infer<typeof revokeSessionSchema>;
export type RevokeAllSessionsRequest = z.infer<typeof revokeAllSessionsSchema>;
export type ImpersonateUserRequest = z.infer<typeof impersonateUserSchema>;
export type CreateApiKeyRequest = z.infer<typeof createApiKeySchema>;
export type RevokeApiKeyRequest = z.infer<typeof revokeApiKeySchema>;