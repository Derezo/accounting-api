export const OrganizationType = {
  SINGLE_BUSINESS: 'SINGLE_BUSINESS',
  MULTI_LOCATION: 'MULTI_LOCATION',
  FRANCHISE: 'FRANCHISE',
  ENTERPRISE: 'ENTERPRISE'
} as const;

export type OrganizationType = typeof OrganizationType[keyof typeof OrganizationType];

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  EMPLOYEE: 'EMPLOYEE',
  VIEWER: 'VIEWER',
  CLIENT: 'CLIENT'
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export const CustomerType = {
  PERSON: 'PERSON',
  BUSINESS: 'BUSINESS'
} as const;

export type CustomerType = typeof CustomerType[keyof typeof CustomerType];

export const CustomerTier = {
  PERSONAL: 'PERSONAL',
  SMALL_BUSINESS: 'SMALL_BUSINESS',
  ENTERPRISE: 'ENTERPRISE',
  EMERGENCY: 'EMERGENCY'
} as const;

export type CustomerTier = typeof CustomerTier[keyof typeof CustomerTier];

export const CustomerStatus = {
  PROSPECT: 'PROSPECT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED'
} as const;

export type CustomerStatus = typeof CustomerStatus[keyof typeof CustomerStatus];

export const BusinessType = {
  SOLE_PROPRIETORSHIP: 'SOLE_PROPRIETORSHIP',
  PARTNERSHIP: 'PARTNERSHIP',
  CORPORATION: 'CORPORATION',
  LLC: 'LLC',
  NON_PROFIT: 'NON_PROFIT',
  GOVERNMENT: 'GOVERNMENT'
} as const;

export type BusinessType = typeof BusinessType[keyof typeof BusinessType];

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  REVISED: 'REVISED'
} as const;

export type QuoteStatus = typeof QuoteStatus[keyof typeof QuoteStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
} as const;

export type InvoiceStatus = typeof InvoiceStatus[keyof typeof InvoiceStatus];

export const PaymentMethod = {
  STRIPE_CARD: 'STRIPE_CARD',
  INTERAC_ETRANSFER: 'INTERAC_ETRANSFER',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  OTHER: 'OTHER'
} as const;

export type PaymentMethod = typeof PaymentMethod[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
} as const;

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

export const ProjectStatus = {
  QUOTED: 'QUOTED',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
} as const;

export type ProjectStatus = typeof ProjectStatus[keyof typeof ProjectStatus];

export const ExpenseCategory = {
  CONTRACTOR: 'CONTRACTOR',
  EQUIPMENT: 'EQUIPMENT',
  SOFTWARE: 'SOFTWARE',
  TRAVEL: 'TRAVEL',
  OFFICE: 'OFFICE',
  MARKETING: 'MARKETING',
  PROFESSIONAL_FEES: 'PROFESSIONAL_FEES',
  OTHER: 'OTHER'
} as const;

export type ExpenseCategory = typeof ExpenseCategory[keyof typeof ExpenseCategory];

export const AccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE'
} as const;

export type AccountType = typeof AccountType[keyof typeof AccountType];

export const TransactionType = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT'
} as const;

export type TransactionType = typeof TransactionType[keyof typeof TransactionType];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VIEW: 'VIEW',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  EXPORT: 'EXPORT',
  IMPORT: 'IMPORT',
  REFUND: 'REFUND',
  AUTHORIZE: 'AUTHORIZE',
  ENCRYPT: 'ENCRYPT',
  DECRYPT: 'DECRYPT',
  DOMAIN_VERIFICATION_REQUESTED: 'DOMAIN_VERIFICATION_REQUESTED',
  DOMAIN_VERIFIED: 'DOMAIN_VERIFIED'
} as const;

export type AuditAction = typeof AuditAction[keyof typeof AuditAction];

export const DocumentCategory = {
  INVOICE: 'INVOICE',
  RECEIPT: 'RECEIPT',
  CONTRACT: 'CONTRACT',
  QUOTE: 'QUOTE',
  TAX_DOCUMENT: 'TAX_DOCUMENT',
  PROOF_OF_PAYMENT: 'PROOF_OF_PAYMENT',
  IDENTIFICATION: 'IDENTIFICATION',
  INSURANCE: 'INSURANCE',
  LEGAL: 'LEGAL',
  COMPLIANCE: 'COMPLIANCE',
  FINANCIAL_STATEMENT: 'FINANCIAL_STATEMENT',
  OTHER: 'OTHER'
} as const;

export type DocumentCategory = typeof DocumentCategory[keyof typeof DocumentCategory];

export const ProcessingStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

export type ProcessingStatus = typeof ProcessingStatus[keyof typeof ProcessingStatus];

export const AccessLevel = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  RESTRICTED: 'RESTRICTED'
} as const;

export type AccessLevel = typeof AccessLevel[keyof typeof AccessLevel];