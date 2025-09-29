# 🏦 Enterprise Accounting API

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.7+-orange.svg)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Test Coverage](https://img.shields.io/badge/Coverage-95%25+-brightgreen.svg)](#testing)
[![API Docs](https://img.shields.io/badge/API-Documented-success.svg)](#api-documentation)
[![Security](https://img.shields.io/badge/Security-Bank%20Level-red.svg)](#security)

> **Enterprise-grade TypeScript REST API for universal accounting and financial operations with bank-level security, multi-tenant architecture, and complete customer lifecycle management.**

## 🎯 Overview

This production-ready accounting API provides a comprehensive solution for businesses requiring sophisticated financial management capabilities. Built with TypeScript and modern web technologies, it offers complete customer lifecycle management from initial quote through project completion and payment processing.

### 🌟 Key Features

- **🏢 Multi-Tenant SaaS Architecture** - Complete organization isolation
- **🔒 Bank-Level Security** - AES-256 encryption, JWT auth, RBAC
- **💳 Payment Processing** - Stripe, Canadian e-Transfer, manual payments
- **📊 Complete Customer Lifecycle** - Quote → Appointment → Invoice → Payment → Project
- **🔍 Comprehensive Audit Trail** - Every action logged and tracked
- **🌐 API-First Design** - RESTful with OpenAPI 3.0 documentation
- **🐳 Production Ready** - Docker, CI/CD, monitoring, compliance

### 🚀 Quick Stats

- **143 API Endpoints** across 12 main service areas including full accounting
- **Double-Entry Bookkeeping** with complete journal entry system
- **Canadian Tax Compliance** (GST, HST, PST, compound QST)
- **Financial Statements** (Balance Sheet, Income Statement, Cash Flow)
- **8 Role-Based Access Levels** with granular permissions
- **Multi-Currency Support** with precise financial calculations
- **Real-Time Notifications** via email and webhooks
- **Regulatory Compliance** - PIPEDA, FINTRAC, CRA, PCI DSS, GAAP

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Docker & Docker Compose** - [Download](https://docs.docker.com/get-docker/)
- **Git** - [Download](https://git-scm.com/)

### 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/your-org/accounting-api.git
cd accounting-api

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Environment Configuration

Edit `.env` with your settings:

```bash
# Database
DATABASE_URL="file:./dev.db"

# Security
JWT_SECRET="your-super-secure-jwt-secret-key-here"
ENCRYPTION_KEY="your-32-character-encryption-key-here"

# Stripe (Optional)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Email (Optional)
SMTP_HOST="smtp.example.com"
SMTP_USER="noreply@example.com"
SMTP_PASSWORD="your-email-password"
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed with sample data (optional)
npm run prisma:seed
```

### 4. Start Development Server

```bash
# Start the server
npm run dev

# Server will be running at:
# 🌐 API: http://localhost:3000
# 📚 Docs: http://localhost:3000/api-docs
```

### 5. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Register test organization
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePass123!",
    "firstName": "Admin",
    "lastName": "User",
    "organizationName": "Test Company"
  }'
```

🎉 **You're ready!** Visit http://localhost:3000/api-docs to explore the interactive API documentation.

---

## 🛠️ Build and Deployment

### Environment-Optimized Build Process

This API supports optimized builds for different environments with proper TypeScript validation and error handling:

```bash
# Development build (includes linting and type checking)
npm run build:dev

# Production build (optimized with full validation)
npm run build:prod

# Staging build (production-like with debug features)
npm run build:staging

# Test the build process
npm run scripts/build-test.sh
```

### Multi-Environment Docker Deployment

Choose the deployment method that fits your environment:

#### Development (Hot Reload)
```bash
# Start development environment with hot reload
docker-compose up -d

# View logs
docker-compose logs -f api
```

#### Staging (Production-like Testing)
```bash
# Deploy to staging environment
docker-compose -f docker-compose.staging.yml up -d

# Available at http://localhost:3001
```

#### Production (Optimized & Secure)
```bash
# Deploy to production
docker-compose -f docker-compose.production.yml up -d

# Check deployment health
curl http://localhost:3000/health
```

### Environment Configuration

The API supports environment-specific configurations:

| Environment | Config File | Database | Features |
|-------------|-------------|----------|----------|
| Development | `.env.development` | SQLite/PostgreSQL | Hot reload, debug logging, Swagger |
| Staging | `.env.staging` | PostgreSQL | Production-like, test data, monitoring |
| Production | `.env.production` | PostgreSQL + replicas | Optimized, security hardened, monitoring |

### Quick Commands Reference

```bash
# Development
npm run dev                # Start development server
npm run build:dev          # Build for development
npm run validate           # Lint + type check + test

# Production
npm run build             # Build for production
npm run start:prod        # Start production server
npm run validate:prod     # Production validation

# Deployment
npm run deploy:staging    # Deploy to staging
npm run deploy:prod       # Deploy to production
npm run clean            # Clean build artifacts
```

### Build Validation

The build process includes comprehensive validation:
- ✅ **ESLint** - Code quality and consistency
- ✅ **TypeScript** - Type safety and compilation
- ✅ **Separate configs** - Development vs production builds
- ✅ **Error handling** - Standardized error responses
- ✅ **Health checks** - Application and dependency monitoring

For detailed deployment instructions, see [docs/BUILD_DEPLOY.md](./docs/BUILD_DEPLOY.md).

---

## 📋 Table of Contents

- [Installation & Setup](#-installation--setup)
- [API Documentation](#-api-documentation)
- [Authentication & Authorization](#-authentication--authorization)
- [Core Features](#-core-features)
- [Database Schema](#-database-schema)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Security](#-security)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)

---

## 🛠️ Installation & Setup

### Development Environment

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Database setup
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# Start development server
npm run dev
```

### Production Environment

```bash
# Build for production
npm run build

# Start production server
npm start

# Or use Docker
docker-compose up -d
```

### Docker Setup

```bash
# Development with Docker
docker-compose up

# Production deployment
docker-compose -f docker-compose.production.yml up -d

# Run tests in Docker
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

---

## 📚 API Documentation

### Interactive Documentation

- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI Spec**: `/docs/openapi.yaml`
- **Postman Collection**: `/docs/examples/postman/collection.json`

### Available Commands

```bash
# Generate documentation
npm run docs:generate

# Serve documentation with live reload
npm run docs:serve

# Build static documentation
npm run docs:build

# Generate TypeScript types from OpenAPI
npm run docs:types
```

### Core API Endpoints

| Service | Endpoint | Description |
|---------|----------|-------------|
| **Authentication** | `/api/v1/auth/*` | Registration, login, refresh tokens |
| **Organizations** | `/api/v1/organizations/*` | Multi-tenant organization management |
| **Users** | `/api/v1/users/*` | User administration and account management |
| **Customers** | `/api/v1/customers/*` | Customer lifecycle management |
| **Quotes** | `/api/v1/quotes/*` | Quote creation and management |
| **Appointments** | `/api/v1/appointments/*` | Scheduling and appointment management |
| **Invoices** | `/api/v1/invoices/*` | Invoice generation and tracking |
| **Payments** | `/api/v1/payments/*` | Payment processing and reconciliation |
| **E-Transfers** | `/api/v1/etransfers/*` | Canadian e-Transfer processing |
| **Manual Payments** | `/api/v1/manual-payments/*` | Manual payment entry and receipts |
| **Projects** | `/api/v1/projects/*` | Project management and tracking |
| **Accounting** | `/api/v1/accounting/*` | Double-entry bookkeeping and journal entries |
| **Tax** | `/api/v1/tax/*` | Tax calculations and Canadian compliance |
| **Financial Statements** | `/api/v1/financial-statements/*` | Balance sheets, income statements, cash flow |
| **Documents** | `/api/v1/documents/*` | Document management with encryption |
| **Audit** | `/api/v1/audit/*` | Audit logging and compliance reporting |

---

## 🔐 Authentication & Authorization

### JWT Authentication

The API uses JWT (JSON Web Tokens) with refresh token rotation for secure authentication.

#### Registration

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe",
    "organizationName": "Acme Corp"
  }'
```

#### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

#### Using Access Tokens

```bash
curl -X GET http://localhost:3000/api/v1/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Role-Based Access Control (RBAC)

The system supports 8 hierarchical roles:

| Role | Permissions | Description |
|------|-------------|-------------|
| **SUPER_ADMIN** | Full system access | System administrators |
| **ADMIN** | Organization-wide access | Organization administrators |
| **MANAGER** | Department management | Department managers |
| **ACCOUNTANT** | Financial operations | Accounting and finance staff |
| **EMPLOYEE** | Standard operations | Regular employees |
| **CONTRACTOR** | Limited access | External contractors |
| **VIEWER** | View-only access | Read-only users |
| **GUEST** | Minimal access | Guest accounts |

---

## 🏗️ Core Features

### 1. Customer Lifecycle Management

Complete 8-stage customer journey management:

```typescript
// Create customer
POST /api/v1/customers
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-0123",
  "tier": "BUSINESS",
  "status": "PROSPECT"
}

// Create quote
POST /api/v1/quotes
{
  "customerId": "customer-id",
  "validUntil": "2024-12-31T23:59:59Z",
  "items": [
    {
      "description": "Web Development Services",
      "quantity": 40,
      "unitPrice": 150.00,
      "taxRate": 0.13
    }
  ]
}
```

### 2. Payment Processing

Support for multiple payment methods:

- **Stripe Integration** - Credit cards, ACH transfers
- **Canadian e-Transfer** - Interac e-Transfer processing
- **Manual Payments** - Cash, cheques, bank transfers

```typescript
// Process Stripe payment
POST /api/v1/payments
{
  "customerId": "customer-id",
  "invoiceId": "invoice-id",
  "amount": 1000.00,
  "paymentMethod": "STRIPE_CARD",
  "stripePaymentMethodId": "pm_1234567890"
}

// Create e-Transfer
POST /api/v1/etransfers
{
  "customerId": "customer-id",
  "invoiceId": "invoice-id",
  "amount": 500.00,
  "recipientEmail": "customer@example.com",
  "securityQuestion": "What is your pet's name?",
  "securityAnswer": "Fluffy"
}
```

### 3. Multi-Tenant Architecture

Complete organization isolation with:

- **Data Isolation** - Each organization's data is completely separate
- **User Management** - Organization-specific user management
- **Billing Isolation** - Separate billing and subscription management
- **Custom Branding** - Organization-specific branding and settings

### 4. Complete Accounting System

Full double-entry bookkeeping and financial reporting:

```typescript
// Create journal transaction
POST /api/v1/accounting/transactions
{
  "organizationId": "org-id",
  "date": "2024-01-15",
  "description": "Cash sale to customer",
  "entries": [
    {
      "accountId": "cash-account-id",
      "type": "DEBIT",
      "amount": 1000.00,
      "description": "Cash received from sale"
    },
    {
      "accountId": "revenue-account-id",
      "type": "CREDIT",
      "amount": 1000.00,
      "description": "Revenue from sale"
    }
  ]
}

// Generate financial statements
GET /api/v1/financial-statements/balance-sheet?asOfDate=2024-01-31
GET /api/v1/financial-statements/income-statement?startDate=2024-01-01&endDate=2024-01-31
GET /api/v1/financial-statements/cash-flow?startDate=2024-01-01&endDate=2024-01-31

// Calculate Canadian taxes
POST /api/v1/tax/calculate
{
  "province": "ON",
  "amount": 1000.00,
  "taxType": "GST_HST"
}
```

### 5. Advanced Analytics

Comprehensive reporting and analytics:

```typescript
// Payment trends
GET /api/v1/payment-analytics/trends?period=monthly

// Customer behavior analysis
GET /api/v1/payment-analytics/customer-behavior

// Cash flow forecasting
GET /api/v1/payment-analytics/forecast?months=6

// Financial ratios analysis
GET /api/v1/financial-statements/ratios?asOfDate=2024-01-31
```

---

## 🗄️ Database Schema

### Core Entities

The system uses a normalized database schema (3NF) with the following core entities:

```sql
-- Multi-tenant core
Organization → Users, Customers, Invoices, Payments
  ├── Users (RBAC with 6 roles)
  ├── Customers (Person or Business entities)
  ├── Products & Services
  └── Financial Transactions

-- Customer Lifecycle
Customer → Quote → Appointment → Invoice → Payment → Project
  ├── Quote (with line items)
  ├── Appointment (scheduling)
  ├── Invoice (generated from quotes)
  ├── Payment (multiple methods)
  └── Project (delivery tracking)

-- Financial Management
Account → Journal Entries → Transactions
  ├── Chart of Accounts
  ├── Double-entry bookkeeping
  └── Financial reporting
```

### Key Relationships

- **Organizations** contain all other entities (multi-tenant isolation)
- **Customers** can be either **Person** or **Business** entities
- **Quotes** convert to **Invoices** which generate **Payments**
- **Projects** track delivery and completion
- **Audit Logs** track all changes for compliance

### Database Commands

```bash
# View database schema
npm run prisma:studio

# Create new migration
npm run prisma:migrate

# Reset database (development only)
npx prisma migrate reset

# Generate ERD diagram
npx prisma generate --generator erd
```

---

## 🧪 Testing

### Test Coverage

The system maintains **95%+ test coverage** across:

- **Unit Tests** - Individual function and service testing
- **Integration Tests** - End-to-end API workflow testing
- **Security Tests** - Authentication and authorization testing
- **Performance Tests** - Load and stress testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run specific test file
npm test -- customers.test.ts

# Watch mode for development
npm run test:watch
```

### Test Structure

```
tests/
├── unit/
│   ├── services/
│   ├── controllers/
│   └── utils/
├── integration/
│   ├── auth.test.ts
│   ├── customers.test.ts
│   └── payments.test.ts
└── helpers/
    ├── test-setup.ts
    └── fixtures.ts
```

---

## 🚀 Deployment

### Docker Deployment

```bash
# Production deployment
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose logs -f api

# Scale services
docker-compose up -d --scale api=3
```

### Environment Configuration

#### Development
```bash
NODE_ENV=development
PORT=3000
DATABASE_URL="file:./dev.db"
```

#### Production
```bash
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://user:pass@localhost:5432/accounting"
REDIS_URL="redis://localhost:6379"
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run validate:full
      - run: npm run build
```

### Health Monitoring

```bash
# Health check endpoint
GET /health

# Detailed system status
GET /health/detailed

# Database connection status
GET /health/db
```

---

## 🔒 Security

### Bank-Level Security Features

1. **Encryption at Rest**
   - AES-256-GCM encryption for sensitive data
   - Organization-specific encryption keys
   - PBKDF2 key derivation with 100,000 iterations

2. **Authentication & Authorization**
   - JWT with refresh token rotation
   - Role-based access control (RBAC)
   - Multi-factor authentication support
   - Account lockout protection

3. **Data Protection**
   - Field-level encryption for PII
   - Comprehensive audit logging
   - Data anonymization capabilities
   - GDPR compliance features

4. **Network Security**
   - Rate limiting and DDoS protection
   - CORS configuration
   - Security headers (Helmet.js)
   - IP geolocation monitoring

### Compliance Standards

- **PCI DSS** - Payment card data protection
- **PIPEDA** - Canadian privacy legislation
- **FINTRAC** - Anti-money laundering compliance
- **CRA** - Canadian tax regulation compliance

### Security Configuration

```bash
# Security environment variables
JWT_SECRET="your-256-bit-secret"
ENCRYPTION_KEY="your-32-character-key"
SESSION_SECRET="your-session-secret"
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 💻 Development

### Development Scripts

```bash
# Development server with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Database operations
npm run prisma:studio
npm run prisma:migrate
npm run prisma:seed

# Validation (lint + typecheck + test)
npm run validate
npm run validate:full
```

### Code Quality Tools

- **TypeScript** - Static type checking
- **ESLint** - Code linting and formatting
- **Prettier** - Code formatting
- **Husky** - Git hooks for pre-commit validation
- **Jest** - Testing framework

### API Development Workflow

1. **Design API endpoints** in OpenAPI specification
2. **Implement controllers** with proper validation
3. **Create service layer** with business logic
4. **Add comprehensive tests** (unit + integration)
5. **Update documentation** automatically
6. **Deploy and monitor** with health checks

### Contributing Guidelines

```bash
# Create feature branch
git checkout -b feature/payment-processing

# Make changes with tests
# Run validation
npm run validate:full

# Commit with conventional commits
git commit -m "feat(payments): add e-transfer support"

# Create pull request
```

---

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check database status
npm run prisma:studio

# Reset database (development)
npx prisma migrate reset

# Regenerate Prisma client
npm run prisma:generate
```

#### Authentication Problems

```bash
# Verify JWT secret is set
echo $JWT_SECRET

# Check token expiration
# Tokens expire after 15 minutes (configurable)

# Clear browser cookies/tokens
# Login again to get fresh tokens
```

#### Payment Processing Issues

```bash
# Test Stripe webhook
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe

# Verify Stripe keys
echo $STRIPE_SECRET_KEY
echo $STRIPE_WEBHOOK_SECRET

# Check payment logs
docker-compose logs api | grep payment
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=accounting-api:* npm run dev

# Database query logging
DATABASE_LOGGING=true npm run dev

# API request logging
API_LOGGING=verbose npm run dev
```

### Performance Optimization

```bash
# Enable Redis caching
REDIS_URL="redis://localhost:6379"

# Database connection pooling
DATABASE_POOL_SIZE=10

# Rate limiting configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Health Checks

```bash
# API health
curl http://localhost:3000/health

# Database health
curl http://localhost:3000/health/db

# External services health
curl http://localhost:3000/health/external
```

---

## 📞 Support & Resources

### Documentation

- **API Documentation**: http://localhost:3000/api-docs
- **Database Schema**: Run `npm run prisma:studio`
- **OpenAPI Specification**: `/docs/openapi.yaml`
- **Deployment Guide**: `/DOCKER-QUICK-START.md`

### Development Resources

- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Prisma Documentation**: https://www.prisma.io/docs/
- **Express.js Guide**: https://expressjs.com/
- **Docker Documentation**: https://docs.docker.com/

### Community & Support

- **Issues**: [GitHub Issues](https://github.com/your-org/accounting-api/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/accounting-api/discussions)
- **Security**: [Security Policy](./SECURITY.md)

---

## 📄 License

This project is proprietary software owned by Lifestream Dynamics.

**Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.**

---

<div align="center">

**Built with ❤️ using TypeScript, Node.js, and modern web technologies**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

</div>