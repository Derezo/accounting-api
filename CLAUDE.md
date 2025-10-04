# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lifestream Dynamics Universal Accounting API - a multi-tenant SaaS REST API for accounting, financial, and business management. Bank-level security with strict 3rd Normal Form database compliance.

- **143 API endpoints** across accounting, tax, financial statements, customer lifecycle, and payment processing
- **Double-entry bookkeeping** with Canadian tax compliance (GST/HST/PST/QST)
- **Multi-tenant architecture** with organization-level data isolation and encryption
- **Development server**: http://localhost:3000 (Swagger UI: /api-docs)

## Commands

```bash
# Development
npm run dev                    # Start development server (nodemon + ts-node)
npm run build                  # Compile TypeScript (alias for build:prod)
npm run build:dev              # Build for development (lint + typecheck + compile)
npm run build:prod             # Production build with optimizations
npm run build:staging          # Staging environment build
npm run start                  # Start production server
npm run start:prod             # Start with NODE_ENV=production
npm run clean                  # Clean dist, coverage, .nyc_output

# Testing
npm test                       # Run unit tests
npm run test:watch             # Unit tests in watch mode
npm run test:coverage          # Unit tests with coverage report
npm run test:integration       # Run integration tests (30s timeout, sequential, 8GB heap)
npm run test:integration:watch # Integration tests in watch mode
npm run test:all               # Unit + integration tests with coverage
npm run test:ci                # CI pipeline tests (coverage + integration)

# RBAC Testing (specialized)
npm run test:rbac:full         # Full RBAC test suite
npm run test:rbac:quick        # Quick RBAC tests
npm run test:rbac:enhanced     # Enhanced RBAC endpoint tests

# Run single test file
npm test -- path/to/file.test.ts
npm run test:integration -- path/to/integration.test.ts

# Code Quality
npm run lint                  # ESLint with strict TypeScript rules
npm run lint:prod             # Production ESLint config
npm run lint:fix              # Auto-fix linting issues
npm run typecheck             # TypeScript compiler checks
npm run typecheck:prod        # Production TypeScript checks
npm run validate              # lint + typecheck + unit tests
npm run validate:full         # lint + typecheck + all tests
npm run validate:prod         # Production validation (lint + typecheck only)

# Database
npm run prisma:generate       # Regenerate Prisma client
npm run prisma:migrate        # Apply database migrations
npm run prisma:studio         # Open Prisma Studio GUI
npm run prisma:seed           # Seed with test data

# Documentation
npm run docs:generate         # Generate JSDoc OpenAPI spec
npm run docs:serve            # Live API docs (Redoc)
npm run docs:build            # Build static API docs
npm run docs:types            # Generate TypeScript types from OpenAPI

# Deployment
npm run deploy:staging        # Deploy to staging environment
npm run deploy:prod           # Deploy to production
```

## High-Level Architecture

### Multi-Tenant Data Model
Every entity includes `organizationId` for complete data isolation. All queries must filter by organization. Soft deletes (`deletedAt`) are mandatory - never hard delete data.

### Service Layer Pattern
- **Controllers** (`src/controllers/`) - HTTP request handling, input validation, response formatting
- **Services** (`src/services/`) - Business logic, transactions, external integrations
- **Routes** (`src/routes/`) - Express routing with middleware composition
- **Middleware** (`src/middleware/`) - Auth, rate limiting, validation, error handling

### Critical Services
- **Encryption Services** (`encryption.service.ts`, `field-encryption.service.ts`) - AES-256-GCM encryption with organization-specific keys, automatic key rotation, searchable encryption, performance monitoring
- **Audit Service** (`audit.service.ts`) - Immutable audit logs for all data modifications, security event tracking
- **Payment Services** - Stripe (`payment.service.ts`), e-Transfer (`etransfer.service.ts`), manual payments (`manual-payment.service.ts`), payment analytics and reconciliation
- **Tax Services** (`tax.service.ts`, `canadian-tax.service.ts`) - Canadian tax calculations with compound tax support (GST/HST/PST/QST)
- **Financial Statements** (`financial-statements.service.ts`, `balance-sheet.service.ts`, `income-statement.service.ts`, `cash-flow.service.ts`) - Complete financial reporting with journal entries
- **Workflow Services** (`workflow-state-machine.service.ts`, `quote-lifecycle.service.ts`, `intake-workflow.service.ts`) - State machine-based workflow management for customer lifecycle
- **Document Services** (`document.service.ts`, `invoice-pdf.service.ts`, `invoice-template.service.ts`) - PDF generation with Puppeteer, template rendering with Handlebars
- **Public Intake API** (`public-intake.routes.ts`, `intake-form-*.service.ts`) - Public-facing intake forms with bot detection, rate limiting, and session management

### 8-Stage Customer Lifecycle
1. Request Quote → 2. Quote Estimated → 3. Quote Accepted → 4. Appointment Scheduled
5. Invoice Generated → 6. Deposit Paid (25-50%) → 7. Work Begins → 8. Project Completion

### Database Patterns
- **3rd Normal Form** strictly enforced - no data duplication
- **Calculated fields** handled at service layer for performance
- **Reference tables** for countries, currencies, tax rates, account categories
- **Audit trails** on all entities with `createdBy`, `updatedBy`, `deletedBy`

## Critical Implementation Rules

1. **Multi-tenancy** - EVERY query must include `organizationId` filtering
2. **3NF Compliance** - No data duplication, proper entity relationships
3. **Audit Logging** - All data modifications require audit entries
4. **Soft Deletes** - Use `deletedAt` timestamps, never hard delete
5. **Field Encryption** - Sensitive data encrypted with org-specific keys
6. **API Versioning** - All routes start with `/api/v1/organizations/:orgId/`
7. **Payment Security** - PCI compliance, never store raw card data

## Testing Configuration

- **Unit Tests**: Jest + TypeScript, 80% coverage threshold, 10s timeout, serial execution (maxWorkers: 1)
- **Integration Tests**: Separate config, 30s timeout, 85% coverage threshold, sequential execution, 8GB heap allocation
- **RBAC Tests**: Specialized role-based access control tests with full endpoint coverage
- **Test Database**: Isolated SQLite per test run with automatic cleanup
- **Path Aliases**: `@/` for src, `@tests/` for test utilities
- **Test Reporting**: JUnit XML + HTML reports for integration tests

Key test files and configurations:
- `jest.config.js` - Unit test configuration with ts-jest preset
- `jest.integration.config.js` - Integration test configuration with detailed reporting
- `tests/integration/setup.ts` - Test database initialization and teardown
- `tests/integration/global-setup.ts` - Pre-test environment setup
- `tests/integration/global-teardown.ts` - Post-test cleanup
- `tests/rbac/*` - Comprehensive RBAC test suites with enhanced runners

Important notes:
- Tests run serially (maxWorkers: 1) to avoid database race conditions
- Integration tests require significant memory (8GB heap via node --max-old-space-size=8192)
- TypeScript diagnostics set to warnOnly in unit tests to prevent type errors from blocking tests
- Use `globalSetup` and `globalTeardown` for proper test isolation

## Development Standards

### TypeScript Configuration
- **Strict mode** enabled with all strict flags
- **Explicit return types** required (`@typescript-eslint/explicit-function-return-type`)
- **No any types** (`@typescript-eslint/no-explicit-any`)
- **No floating promises** (`@typescript-eslint/no-floating-promises`)
- **Path aliases**: `@/` for src, `@prisma/` for prisma, `@tests/` for tests

### ESLint Rules
- `@typescript-eslint/recommended-requiring-type-checking` enabled
- No console.log (only console.error allowed)
- Prefer const, no var
- Unused vars must be prefixed with `_`

### Database Management
- **Schema**: `prisma/schema.prisma` (3NF compliant, 84+ models)
- **Migrations**: Production uses PostgreSQL, development uses SQLite
- **Seeding**: `prisma/seed.ts` creates test organizations and data
- **Multi-tenancy**: Every entity includes `organizationId` foreign key
- **Master Organization**: Special `isMasterOrg` flag for lifestreamdynamics.com domain
- Always use transactions for multi-table operations
- Soft deletes only - `deletedAt` timestamp required on all entities

## Docker Support

```bash
docker-compose up -d              # Dev environment (PostgreSQL + Redis)
docker-compose -f docker-compose.production.yml up -d  # Production
docker-compose -f docker-compose.test.yml up --build   # Run tests
```

Environment files needed:
- `.env` - Development configuration
- `.env.development` - Development-specific settings
- `.env.staging` - Staging environment
- `.env.production` - Production settings
- `.env.test` - Test environment

## Key Middleware Chain

Understanding the middleware execution order is critical for debugging and new feature development:

1. **Security Layer**
   - `helmet` - Security headers
   - `cors` - Cross-origin resource sharing
   - `rate-limit.middleware.ts` - API rate limiting (authenticated)
   - `public-rate-limit.middleware.ts` - Public endpoint rate limiting

2. **Authentication & Authorization**
   - `auth.middleware.ts` - JWT token validation, user session
   - `organization.middleware.ts` - Organization context injection
   - `master-org.middleware.ts` - Master organization validation
   - `resource-permission.middleware.ts` - Resource-level permissions

3. **Specialized Middleware**
   - `intake-token.middleware.ts` - Public intake form token validation
   - `bot-detection.middleware.ts` - Bot detection for public endpoints
   - `workflow.middleware.ts` - Workflow state validation
   - `encryption.middleware.ts` - Automatic field encryption/decryption
   - `audit.middleware.ts` - Audit logging for all mutations

4. **Request Processing**
   - `validation.middleware.ts` - Request validation (express-validator)
   - `upload.middleware.ts` - File upload handling (multer)
   - `timeout.middleware.ts` - Request timeout management

5. **Error Handling**
   - `error-handler.middleware.ts` - Centralized error handling and formatting
   - `debug.middleware.ts` - Debug logging in development
   - `api-deprecation.middleware.ts` - API versioning and deprecation warnings

## API Route Organization

Routes are organized by resource type with consistent patterns:

- **Authenticated Routes**: `/api/v1/organizations/:orgId/{resource}` - Require auth, organization context
- **Public Routes**: `/api/v1/public/{resource}` - Public-facing intake, quote acceptance, appointment booking
- **Auth Routes**: `/api/v1/auth/*` - Registration, login, token refresh, password reset
- **Admin Routes**: Routes with ADMIN/SUPER_ADMIN role requirements

Key public endpoints (no auth required):
- `POST /api/v1/public/intake/:token` - Public intake form submission
- `POST /api/v1/public/quotes/:token/accept` - Public quote acceptance
- `POST /api/v1/public/appointments/:token/book` - Public appointment booking

## Encryption Architecture

The system uses multiple layers of encryption:

1. **Field-Level Encryption** (`field-encryption.service.ts`)
   - AES-256-GCM encryption for PII fields
   - Organization-specific encryption keys
   - Automatic encryption/decryption via middleware
   - Searchable encryption support for indexed fields

2. **Key Management** (`encryption-key-manager.service.ts`)
   - PBKDF2 key derivation (100,000 iterations)
   - Automatic key rotation with configurable schedules
   - Key versioning for backward compatibility
   - Secure key storage and retrieval

3. **Performance Monitoring** (`encryption-performance.service.ts`)
   - Encryption operation metrics
   - Performance bottleneck detection
   - Audit trail for all encryption operations

4. **Encryption Audit** (`encryption-audit.service.ts`)
   - Comprehensive audit logs for all encryption/decryption operations
   - Compliance reporting
   - Security event detection