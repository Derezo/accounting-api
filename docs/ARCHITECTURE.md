# System Architecture

## Overview

The Lifestream Dynamics Accounting API is built on a modern, scalable architecture designed for multi-tenant SaaS operations with bank-level security.

## Technology Stack

### Core
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.x
- **Framework**: Express.js
- **Database**: PostgreSQL (production), SQLite (development/testing)
- **ORM**: Prisma 5.x

### Security
- **Authentication**: JWT with refresh tokens
- **Encryption**: AES-256-GCM for field-level encryption
- **Password Hashing**: bcrypt (12 rounds)
- **API Security**: Rate limiting, CORS, Helmet

### Documentation
- **API Docs**: Swagger/OpenAPI 3.0
- **Code Docs**: JSDoc, TypeDoc
- **Interactive**: Swagger UI, ReDoc

### Testing
- **Test Framework**: Jest
- **API Testing**: Supertest
- **Coverage**: Jest coverage reports

### DevOps
- **Containerization**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **Monitoring**: Custom health checks, Winston logging

## Architecture Patterns

### Multi-Tenant SaaS
```
Organization (Tenant)
  ├── Users
  ├── Customers
  ├── Accounts
  ├── Transactions
  ├── Documents
  └── Encryption Keys
```

Every entity includes `organizationId` for complete data isolation.

### Service Layer Pattern
```
Request → Routes → Controllers → Services → Database
                ↓               ↓
           Middleware      Validation
```

### Key Components

#### 1. Routes (`src/routes/`)
- Define API endpoints
- Apply middleware (auth, validation, rate limiting)
- Map requests to controllers

#### 2. Controllers (`src/controllers/`)
- Handle HTTP requests/responses
- Input validation
- Error handling
- Response formatting

#### 3. Services (`src/services/`)
- Business logic implementation
- Database transactions
- External integrations
- Data transformation

#### 4. Middleware (`src/middleware/`)
- **Authentication**: JWT validation
- **Authorization**: Role-based access control
- **Validation**: Request schema validation
- **Audit**: Change tracking
- **Rate Limiting**: Request throttling
- **Error Handling**: Centralized error processing

#### 5. Database Layer
- **Prisma Schema**: Type-safe database schema
- **Migrations**: Version-controlled schema changes
- **Seeding**: Test data generation

## Data Architecture

### Database Normalization (3NF)
All data follows Third Normal Form principles:
- No duplicate data
- Proper entity relationships  
- Referential integrity enforced
- Calculated fields at service layer

### Entity Relationships
```
Organization
  └── Users
  └── Customers
      ├── Person (1:1)
      └── Business (1:1)
  └── Accounts
  └── JournalTransactions
      └── JournalEntries (many)
  └── Quotes
      └── QuoteItems (many)
  └── Invoices
      └── InvoiceItems (many)
  └── Payments
  └── Projects
  └── Appointments
  └── Documents
```

### Audit Trail
Every entity tracks:
- `createdBy` - User who created record
- `updatedBy` - User who last updated
- `deletedBy` - User who soft-deleted
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp
- `deletedAt` - Soft delete timestamp

## Security Architecture

### Multi-Layer Security
1. **Network Layer**: HTTPS, CORS, Rate limiting
2. **Authentication Layer**: JWT tokens, session management
3. **Authorization Layer**: Role-based access control
4. **Data Layer**: Field-level encryption, data isolation
5. **Audit Layer**: Comprehensive change tracking

### Encryption Strategy
- **Organization Keys**: Unique encryption key per organization
- **Field-Level**: Sensitive fields encrypted individually
- **Key Rotation**: Automatic 90-day rotation
- **Key Storage**: Encrypted storage of encryption keys

### Multi-Tenancy Security
- **Data Isolation**: `organizationId` filtering on all queries
- **API Key Authentication**: Service-to-service auth
- **Master Organization**: Exclusive system administration rights

## API Design Principles

### RESTful Design
- Resource-based URLs
- HTTP verbs for actions (GET, POST, PUT, DELETE)
- Proper status codes
- JSON request/response bodies

### Versioning
- URL-based versioning (`/api/v1/`)
- Backward compatibility maintained
- Deprecation warnings

### Error Handling
- RFC 7807 Problem Details format
- Consistent error structure
- Detailed validation errors
- Stack traces in development only

## Scalability Considerations

### Horizontal Scaling
- Stateless API design
- JWT token-based auth (no server sessions)
- Redis for caching (optional)
- Load balancer ready

### Performance Optimization
- Database indexing on frequent queries
- Pagination for large result sets
- Eager loading to avoid N+1 queries
- Connection pooling

### Caching Strategy
- In-memory caching for reference data
- Redis for distributed caching (optional)
- ETags for conditional requests

## Development Workflow

### Git Workflow
```
main (production)
  └── develop (staging)
      └── feature/* (feature branches)
```

### CI/CD Pipeline
1. **Commit**: Pre-commit hooks (lint, typecheck)
2. **Push**: Run tests, build check
3. **PR**: Full test suite, coverage check
4. **Merge**: Deploy to staging
5. **Release**: Deploy to production

### Code Quality Gates
- ESLint (strict TypeScript rules)
- TypeScript compiler (strict mode)
- Jest tests (80% coverage threshold)
- Prettier formatting

## Monitoring & Observability

### Health Checks
- `/health` - Basic health status
- `/health/detailed` - Component health
- Database connectivity
- External service status

### Logging
- **Winston** logger
- Structured JSON logs
- Log levels: error, warn, info, debug
- Request/response logging
- Error tracking

### Metrics
- API response times
- Error rates
- Database query performance
- Cache hit rates

## Deployment Architecture

### Development
```
Docker Container
  ├── Node.js Application
  ├── SQLite Database
  └── File Storage (local)
```

### Production
```
Load Balancer
  └── API Servers (N instances)
      ├── PostgreSQL (managed)
      ├── Redis (managed)
      └── S3/Cloud Storage
```

## Configuration Management

### Environment Variables
- **Development**: `.env`
- **Testing**: `.env.test`
- **Production**: `.env.production`
- **CI/CD**: Secrets management

### Feature Flags
- Organization-level feature toggles
- Role-based feature access
- A/B testing capabilities

## Third-Party Integrations

### Payment Processing
- Stripe API integration
- E-Transfer handling
- PCI compliance

### Document Storage
- Local filesystem (development)
- AWS S3 (production)
- Azure Blob Storage (optional)

### Email Services
- Transactional emails
- Invoice delivery
- Notification system

---

**Last Updated**: 2025-10-01
**Architecture Version**: 1.0
