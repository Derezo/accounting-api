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
npm run build                  # Compile TypeScript to dist/
npm run start                  # Start production server

# Testing
npm test                       # Run unit tests
npm run test:integration      # Run integration tests (30s timeout, sequential)
npm run test:all              # Unit + integration tests with coverage
npm run test:ci               # CI pipeline tests

# Run single test file
npm test -- path/to/file.test.ts
npm run test:integration -- path/to/integration.test.ts

# Code Quality
npm run lint                  # ESLint with strict TypeScript rules
npm run typecheck            # TypeScript compiler checks
npm run validate             # lint + typecheck + unit tests
npm run validate:full        # lint + typecheck + all tests

# Database
npm run prisma:migrate       # Apply database migrations
npm run prisma:studio        # Open Prisma Studio GUI
npm run prisma:seed          # Seed with test data
npm run prisma:generate      # Regenerate Prisma client

# Documentation
npm run docs:serve           # Live API docs (Redoc)
npm run docs:build           # Build static API docs
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
- **Encryption Services** - Field-level encryption with organization-specific keys, automatic key rotation
- **Audit Service** - Immutable audit logs for all data modifications
- **Payment Services** - Stripe integration, e-Transfer handling, payment reconciliation
- **Tax Services** - Canadian tax calculations with compound tax support
- **Financial Statements** - Balance sheet, income statement, cash flow generation

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

- **Unit Tests**: Jest + TypeScript, 80% coverage threshold
- **Integration Tests**: Separate config, 30s timeout, sequential execution
- **Test Database**: Isolated SQLite per test run
- **Path Aliases**: `@/` for src, `@tests/` for test utilities

Key test files:
- `jest.config.js` - Unit test configuration
- `jest.integration.config.js` - Integration test configuration (85% coverage)
- `tests/integration/setup.ts` - Test database initialization
- `tests/integration/global-setup.ts` - Pre-test environment setup

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
- **Schema**: `prisma/schema.prisma` (3NF compliant)
- **Migrations**: Production uses PostgreSQL, development uses SQLite
- **Seeding**: `prisma/seed.ts` creates test organizations and data
- Always use transactions for multi-table operations

## Docker Support

```bash
docker-compose up -d              # Dev environment (PostgreSQL + Redis)
docker-compose -f docker-compose.production.yml up -d  # Production
docker-compose -f docker-compose.test.yml up --build   # Run tests
```

Environment files needed:
- `.env` - Development configuration
- `.env.production` - Production settings
- `.env.test` - Test environment