# Accounting API - Bank-Level Security Deployment Guide

## Overview

This repository contains a comprehensive TypeScript accounting API with Docker containerization and bank-level security validation. The system is designed for multi-tenant SaaS architecture with robust security controls, audit logging, and compliance features.

## 🚀 Quick Start

### Development Environment

```bash
# Clone and setup development environment
git clone <repository-url>
cd accounting-api

# Run automated development setup
./scripts/dev-setup.sh

# Alternative manual setup
npm install
cp .env.example .env
docker-compose up -d
npx prisma migrate dev
npm run dev
```

### Production Deployment

```bash
# Run automated production setup
sudo ./scripts/setup-production.sh your-domain.com admin@your-domain.com

# Manual production setup
docker-compose -f docker-compose.production.yml up -d
```

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                          Load Balancer (Nginx)                  │
│                     SSL Termination & WAF                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                     API Layer (Node.js)                        │
│                   • Authentication & RBAC                      │
│                   • Rate Limiting & Validation                 │
│                   • Audit Logging                             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│     Database Layer      │        Cache Layer                   │
│   PostgreSQL Primary    │         Redis Cluster                │
│   PostgreSQL Replica    │       Session Storage               │
└─────────────────────────┴───────────────────────────────────────┘
```

### Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Security Layers                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Network Security     │ Firewall, VPN, Network Segmentation  │
│ 2. Application Security │ HTTPS, CORS, Security Headers        │
│ 3. Authentication      │ JWT, API Keys, 2FA                   │
│ 4. Authorization       │ RBAC, Multi-tenant Isolation         │
│ 5. Data Protection     │ Encryption at Rest/Transit           │
│ 6. Audit & Monitoring  │ Comprehensive Logging & Alerting     │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 Security Features

### Authentication & Authorization
- **JWT-based authentication** with refresh tokens
- **Role-Based Access Control** (6 roles: SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER)
- **API key authentication** for service-to-service communication
- **Multi-tenant data isolation** with organization-level scoping
- **Session management** with geographic validation

### Data Protection
- **Field-level encryption** for sensitive data (SSN, salary, bank accounts)
- **Organization-specific encryption keys**
- **Comprehensive audit logging** for all CRUD operations
- **Soft deletes** with full audit trails

### Input Validation & Security
- **Zod schema validation** for all inputs
- **SQL injection prevention** through Prisma ORM
- **XSS protection** with input sanitization
- **Rate limiting** with endpoint-specific controls
- **CORS policy enforcement**

### Security Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
```

## 🐳 Docker Configuration

### Development Stack
- **API Container**: Node.js with TypeScript hot reload
- **PostgreSQL**: Development database with debug logging
- **Redis**: Session storage and caching
- **Nginx**: Reverse proxy with rate limiting

### Production Stack
- **Load-balanced API**: Multiple API instances behind Nginx
- **PostgreSQL Cluster**: Primary + read replica with backup
- **Redis Cluster**: Master + replica for high availability
- **ELK Stack**: Elasticsearch, Logstash, Kibana for logging
- **Monitoring**: Prometheus + Grafana for metrics

## 🛡️ Security Testing

### Automated Security Tests

```bash
# Run comprehensive security test suite
node security-tests/security-test-suite.js

# Run penetration testing
./security-tests/penetration-tests.sh
```

### Test Coverage
- **Authentication bypass** attempts
- **Authorization escalation** testing
- **RBAC permission boundaries** validation
- **SQL injection** protection
- **XSS protection** validation
- **Rate limiting** effectiveness
- **CORS policy** enforcement
- **Input validation** security
- **Multi-tenant isolation** testing
- **Session management** security

## 📊 Monitoring & Logging

### Log Categories
```yaml
Security Logs: Authentication, authorization violations, API violations
Audit Logs: All CRUD operations, privilege changes, payments
Application Logs: Errors, performance metrics, API response times
Access Logs: HTTP requests, load balancer logs, database connections
```

### Monitoring Stack
- **Prometheus**: Metrics collection and alerting
- **Grafana**: Dashboards and visualization
- **ELK Stack**: Log aggregation and analysis
- **Custom Alerts**: Real-time security event monitoring

## 🗄️ Database Schema

### Core Entities
- **Organizations**: Multi-tenant container
- **Users**: Authentication and RBAC
- **Customers**: Individual and business customers
- **Financial Records**: Quotes, invoices, payments, expenses
- **Projects**: Work tracking and scheduling
- **Audit Logs**: Comprehensive change tracking

### Security Features
- **Row-level security** for multi-tenant isolation
- **Encrypted sensitive fields** with organization keys
- **Audit triggers** for all data changes
- **Database-level backups** with point-in-time recovery

## 🚀 Deployment Options

### Local Development
```bash
# Quick development setup
./scripts/dev-setup.sh

# Manual commands
docker-compose up -d
npm run dev
```

### Production Deployment
```bash
# Automated production setup
sudo ./scripts/setup-production.sh your-domain.com

# Manual production deployment
docker-compose -f docker-compose.production.yml up -d
```

### Cloud Deployment (AWS/Azure/GCP)
```bash
# Use production Docker Compose with cloud-specific modifications
# Configure managed databases, load balancers, and monitoring
# See SECURITY-ANALYSIS.md for detailed cloud deployment guide
```

## 🔧 Configuration

### Environment Variables
```bash
# Core Configuration
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://:password@host:6379

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
API_KEY_SALT=your-api-key-salt

# External Services
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Docker Secrets (Production)
```bash
# Create production secrets
echo "secure_password" | docker secret create postgres_password -
echo "jwt_secret_key" | docker secret create jwt_secret -
# ... additional secrets
```

## 📋 Compliance & Standards

### Bank-Level Security Standards
- **PCI DSS**: Payment card industry compliance
- **SOX**: Sarbanes-Oxley financial data requirements
- **GDPR**: Privacy and data protection compliance
- **ISO 27001**: Information security management

### Security Controls
- **Access Control**: Role-based with principle of least privilege
- **Data Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Audit Logging**: Comprehensive with 7-year retention
- **Incident Response**: Automated alerting and response procedures

## 🧪 Testing

### Security Testing
```bash
# Comprehensive security test suite
npm run test:security

# OWASP ZAP integration
docker-compose --profile security up security-scanner

# Manual penetration testing
./security-tests/penetration-tests.sh
```

### API Testing
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Load testing
npm run test:load
```

## 📖 API Documentation

### Core Endpoints
```
Authentication:
  POST /api/v1/auth/login
  POST /api/v1/auth/register
  POST /api/v1/auth/refresh
  POST /api/v1/auth/logout

Organizations:
  GET    /api/v1/organizations
  POST   /api/v1/organizations
  PUT    /api/v1/organizations/:id
  DELETE /api/v1/organizations/:id

Customers:
  GET    /api/v1/customers
  POST   /api/v1/customers
  PUT    /api/v1/customers/:id
  DELETE /api/v1/customers/:id

Financial:
  GET    /api/v1/quotes
  POST   /api/v1/quotes
  GET    /api/v1/invoices
  POST   /api/v1/invoices
  GET    /api/v1/payments
  POST   /api/v1/payments
```

### Authentication
```javascript
// JWT Token Authentication
headers: {
  'Authorization': 'Bearer your-jwt-token'
}

// API Key Authentication
headers: {
  'X-API-Key': 'your-api-key'
}
```

## 🔍 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database health
docker-compose exec postgres pg_isready

# View database logs
docker-compose logs postgres

# Reset database
./scripts/reset-db.sh
```

#### Authentication Problems
```bash
# Check JWT configuration
echo $JWT_SECRET

# View authentication logs
docker-compose logs api | grep auth

# Test authentication endpoint
curl -X POST localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

#### Performance Issues
```bash
# Monitor resource usage
docker stats

# Check application metrics
curl localhost:3000/health

# View slow query logs
docker-compose exec postgres tail -f /var/log/postgresql/slow.log
```

## 📚 Additional Resources

- **Security Analysis**: See `SECURITY-ANALYSIS.md` for detailed security assessment
- **API Documentation**: OpenAPI/Swagger documentation at `/api/docs`
- **Database Schema**: Prisma schema at `prisma/schema.prisma`
- **Security Tests**: Comprehensive test suite in `security-tests/`

## 🤝 Contributing

### Security Guidelines
1. **Never commit secrets** or sensitive configuration
2. **Run security tests** before submitting changes
3. **Follow secure coding practices** and OWASP guidelines
4. **Update audit logs** for any security-related changes

### Development Workflow
```bash
# Setup development environment
./scripts/dev-setup.sh

# Run tests before committing
npm run validate

# Security testing
npm run test:security
```

## 📄 License

This project is licensed under a proprietary license. See LICENSE file for details.

## 🆘 Support

For security issues or production support:
- **Security Issues**: security@your-company.com
- **Production Support**: support@your-company.com
- **Documentation**: See additional markdown files in this repository

---

**⚠️ Security Notice**: This system handles sensitive financial data. Ensure all security guidelines are followed and regular security audits are conducted.