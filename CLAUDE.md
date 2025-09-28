# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Lifestream Dynamics Accounting API - a comprehensive REST API backend designed for universal accounting, financial, and business management operations for small to medium businesses. The system is architected as a multi-tenant SaaS platform with bank-level security and 3rd Normal Form database compliance.

## Technology Stack

- **ORM**: Prisma with TypeScript
- **Development Database**: SQLite with full-text search
- **Production Database**: PostgreSQL 15+ with advanced indexing
- **Caching**: Redis Cluster for session and query caching
- **Message Queue**: Bull/BullMQ for background jobs
- **File Storage**: S3-compatible storage for documents
- **Search**: PostgreSQL full-text search with GIN indexes

## Commands

Development and testing commands are fully implemented:

```bash
# Development
npm run dev                    # Start development server with nodemon
npm run build                  # Compile TypeScript to dist/
npm run start                  # Start production server from dist/

# Testing
npm test                       # Run unit tests
npm run test:watch            # Run tests in watch mode
npm run test:coverage         # Run tests with coverage report
npm run test:integration      # Run integration tests
npm run test:integration:watch # Run integration tests in watch mode
npm run test:all              # Run all tests with coverage
npm run test:ci               # CI pipeline test command

# Code Quality
npm run lint                  # ESLint with TypeScript rules
npm run lint:fix             # Auto-fix linting issues
npm run typecheck            # TypeScript type checking
npm run validate             # Run lint + typecheck + test
npm run validate:full        # Run lint + typecheck + all tests

# Database
npm run prisma:generate      # Generate Prisma client
npm run prisma:migrate       # Run database migrations
npm run prisma:studio        # Open Prisma Studio GUI
npm run prisma:seed          # Seed database with test data

# Documentation
npm run docs:generate        # Generate API documentation
npm run docs:serve           # Serve API docs with live reload
npm run docs:build           # Build static API documentation
```

## Architecture & Structure

### Multi-Tenant Organization Model
- Complete data isolation per organization
- Organization-specific encryption keys
- Soft delete support across all entities
- Comprehensive audit logging

### 8-Stage Customer Lifecycle Pipeline
1. Request Quote - Initial customer submission
2. Quote Estimated - Professional assessment and pricing
3. Quote Accepted - Customer approval triggers workflow
4. Appointment Scheduled - 15-minute consultation slots
5. Invoice Generated - Detailed billing with deposits
6. Deposit Paid - Work authorization (25-50% deposit)
7. Work Begins - Project execution
8. Project Completion - Final payment and satisfaction

### Payment Processing System
- **Stripe Integration** - Credit cards and digital wallets
- **Interac e-Transfer** - Canadian market semi-automated
- **Cash Payments** - Manual entry with receipts
- **Bank Transfers** - Enterprise wire transfers
- Reference tracking and automated reconciliation
- Multi-currency support

### Database Design Principles
- Strict 3rd Normal Form compliance
- Separation of Person vs Business entities
- Normalized reference tables for countries, currencies, categories
- Calculated fields handled properly for performance
- Comprehensive soft delete and audit trails

### Security Architecture
- Bank-level security requirements
- Organization-specific data encryption
- Complete audit logging with immutable records
- Role-based access control (RBAC)
- API key management with rotation
- PCI compliance for payment processing

### Service Tier Structure
- Personal Services: $75-175/hour
- Small Business Solutions: $125-275/hour
- Enterprise Solutions: $200-400/hour
- Emergency Support: $300-500/hour

## Key Business Rules

- Deposit requirements (25-50%) before work authorization
- 15-day payment terms as default
- Quote validity period of 30 days
- Response time commitment of 2-4 hours during business hours
- Automatic payment matching and reconciliation
- T4A generation for contractor payments

## Important Considerations

When implementing features in this codebase:

1. **Always maintain 3NF compliance** - No data duplication, proper entity separation
2. **Multi-tenancy first** - All queries must include organizationId filtering
3. **Audit everything** - All data modifications require audit log entries
4. **Security by default** - Encryption for sensitive data, proper authentication/authorization
5. **Performance optimization** - Use proper indexing, caching strategies for calculated fields
6. **Payment processing** - Follow PCI compliance, never store raw card details
7. **Soft deletes** - Never hard delete data, use deletedAt timestamps

## File Structure Overview

Fully implemented TypeScript application with comprehensive feature set:

### Source Code Structure (`src/`)
- **`controllers/`** - HTTP request handlers for all API endpoints
- **`services/`** - Business logic layer with encryption, audit, and payment services
- **`routes/`** - Express route definitions with validation and documentation
- **`middleware/`** - Authentication, authorization, rate limiting, and security
- **`models/`** - Prisma database models and TypeScript types
- **`utils/`** - Utility functions, validators, and helper classes
- **`validators/`** - Input validation schemas using Zod
- **`config/`** - Environment configuration and database setup

### Key Implementation Features
- **Authentication System** - JWT with refresh tokens, 2FA support, session management
- **Encryption Services** - Field-level encryption, key management, audit logging
- **Payment Processing** - Stripe integration, e-Transfer handling, manual payments
- **Customer Lifecycle** - Complete quote-to-payment workflow with appointments
- **Project Management** - Task tracking, time management, billing integration
- **Audit System** - Comprehensive change tracking with immutable logs

### Documentation Files
- `ACCOUNTING_API_ARCHITECTURE.md` - Complete system architecture
- `ARCHITECTURAL_ANALYSIS_AND_IMPROVEMENTS.md` - Critical improvements and 3NF compliance
- `PAYMENT_SYSTEM.md` - Payment processing implementation details
- `CUSTOMER_LIFECYCLE.md` - 8-stage customer conversion pipeline
- `ENCRYPTION_SYSTEM_DOCUMENTATION.md` - Security and encryption details
- `README-DEPLOYMENT.md` - Production deployment guide
- `README-INTEGRATION-TESTS.md` - Testing strategy and implementation

## API Design Patterns

When implementing REST endpoints:
- Use proper HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Include organizationId in all routes: `/api/v1/organizations/:orgId/resource`
- Implement pagination, filtering, and sorting on list endpoints
- Return appropriate HTTP status codes
- Include comprehensive error messages with error codes
- Version the API from the start (`/api/v1/`)

## Testing Strategy

Comprehensive testing implementation with high coverage:

### Test Configuration
- **Unit Tests**: Jest with TypeScript support, coverage thresholds at 80%
- **Integration Tests**: Separate Jest config for API endpoint testing
- **Test Database**: Isolated SQLite instances for each test run
- **Coverage Reports**: HTML and JSON coverage reports generated
- **Path Aliases**: `@/` for src imports, `@tests/` for test utilities

### Test Structure
- **`tests/`** - Integration tests, setup files, and test utilities
- **`src/**/*.test.ts`** - Unit tests co-located with source files
- **`tests/setup.ts`** - Global test configuration and database setup
- **Test Timeout**: 10 seconds for integration tests

### Testing Best Practices
- All new business logic requires unit tests
- API endpoints require integration tests
- Critical workflows (quote-to-payment) have E2E test coverage
- Payment processing includes test scenarios with mocked Stripe
- Multi-tenant isolation is verified in integration tests
- Security and permission testing covers all authentication flows

### Running Tests
Use `npm run test:all` for complete test suite with coverage or `npm run test:ci` for CI pipeline execution.

## Development Workflow

### Code Quality Standards
- **TypeScript**: Strict mode enabled with explicit return types required
- **ESLint**: Comprehensive rules including `@typescript-eslint/recommended-requiring-type-checking`
- **Path Aliases**: Use `@/` for src imports in all new code
- **Error Handling**: Proper async/await patterns, no floating promises
- **Security**: Never log sensitive data, use proper encryption for PII

### Database Development
- **Prisma Schema**: Located in `prisma/schema.prisma` with comprehensive 3NF-compliant models
- **Migrations**: Use `npm run prisma:migrate` for schema changes
- **Seeding**: `npm run prisma:seed` for development data
- **Studio**: `npm run prisma:studio` for GUI database management

### Multi-Tenant Considerations
- All database queries MUST include `organizationId` filtering
- Organization-specific encryption keys are managed automatically
- Audit logs are required for all data modifications
- Soft deletes are mandatory (use `deletedAt` timestamp)

## Docker & Deployment

The application includes comprehensive Docker support:

- **`Dockerfile`** - Production-optimized multi-stage build
- **`Dockerfile.test`** - Testing environment configuration
- **`docker-compose.yml`** - Development environment with PostgreSQL and Redis
- **`docker-compose.production.yml`** - Production deployment configuration
- **`docker-compose.test.yml`** - Test environment setup

### Quick Docker Start
```bash
# Development environment
docker-compose up -d

# Production environment
docker-compose -f docker-compose.production.yml up -d

# Testing environment
docker-compose -f docker-compose.test.yml up --build
```

Refer to `README-DEPLOYMENT.md` for detailed production deployment instructions and `DOCKER-QUICK-START.md` for development setup.