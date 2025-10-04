# API Documentation
**Lifestream Dynamics Universal Accounting API v2.0**

**Version:** 2.0.0 | **Release Date:** October 2, 2025 | **Security Score:** 92/100 | **Compliance:** PCI DSS 90%, SOC 2 85%, PIPEDA 95%

---

## 🎯 For Frontend Developers

Start here for frontend integration:

1. **[Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)** ⭐ **START HERE**
   - Complete integration guide with code examples
   - Authentication & session management
   - Rate limiting handling
   - Password requirements
   - Error handling patterns
   - React/TypeScript examples

2. **[API Changelog](./API_CHANGELOG.md)**
   - Version history
   - Breaking changes (none in v2.0!)
   - Migration guide
   - Roadmap

3. **[API Reference (Interactive)](http://localhost:3000/api-docs)**
   - Swagger UI (when dev server running)
   - Try API calls directly from browser

4. **[API Reference (Static HTML)](./api-docs.html)**
   - Offline API documentation (3.6 MB)

5. **[OpenAPI Specification](./jsdoc-openapi.yaml)**
   - Machine-readable spec
   - 197 endpoints documented
   - Import into Postman/Insomnia

---

## 📖 Quick Reference

### Base URLs

```bash
# Development
http://localhost:3000

# Staging
https://staging-api.lifestreamdynamics.com

# Production
https://api.lifestreamdynamics.com
```

### Authentication

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

Response:
{
  "token": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "user": { ... },
  "expiresIn": "2h"
}
```

### Making Authenticated Requests

```http
GET /api/v1/organizations/:orgId/customers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Session Management (v2.0 Changes)

| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Session Duration | 7 days | 2 hours |
| Idle Timeout | None | 15 minutes |
| Token Refresh | Manual | Recommended (auto) |
| Concurrent Sessions | Unlimited | 3 max |
| Device Validation | No | Yes (fingerprint + IP) |

### Password Requirements (v2.0)

- ✅ 12+ characters (was 6+)
- ✅ Uppercase letter
- ✅ Lowercase letter
- ✅ Number
- ✅ Special character
- ✅ Cannot reuse last 5 passwords
- ✅ 90-day expiration

### Rate Limits (v2.0)

| Endpoint | Limit |
|----------|-------|
| Login | 5 attempts per 15 minutes |
| Registration | 3 attempts per hour |
| Password Reset | 3 attempts per hour |
| Public Intake | 10 requests per minute |

---

## 📚 Documentation Index

### API Documentation
- **[INDEX.md](./INDEX.md)** - Complete documentation index
- **[API Summary](./API_SUMMARY.md)** - All 200+ endpoints
- **[Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)** - Frontend integration (code examples)
- **[API Changelog](./API_CHANGELOG.md)** - Version history & migration

### Security & Compliance
- **[Security Improvements](../SECURITY_IMPROVEMENTS_COMPLETE.md)** - v2.0 security enhancements
- **[Security Compliance Report](../SECURITY_COMPLIANCE_REPORT.md)** - Full security audit
- **[Immediate Action Items](../IMMEDIATE_ACTION_ITEMS.md)** - Production checklist
- **[Security Fixes Report](../SECURITY_FIXES_REPORT.md)** - Implementation details

### Specialized Guides
- **[Public Intake API](./PUBLIC_INTAKE_API_FIX.md)** - Public endpoints (no auth)
- **[Invoice Item Versioning](./INVOICE_ITEM_VERSIONING.md)** - Audit trail system
- **[Financial Fixes](./FINANCIAL_FIXES_SUMMARY.md)** - Financial compliance
- **[Architecture](./ARCHITECTURE.md)** - System design
- **[Testing Guide](./TESTING_GUIDE.md)** - Testing strategies

---

## 🚀 What's New in v2.0

### Security Enhancements (Production-Ready)

✅ **Password Security**
- Strong password policy (12+ chars, complexity)
- Password history (prevent reuse of last 5)
- 90-day expiration
- Real-time validation

✅ **Session Security**
- 2-hour duration (was 7 days)
- 15-minute idle timeout
- Device fingerprinting
- IP validation
- 3 concurrent session limit

✅ **Rate Limiting**
- Login: 5 attempts / 15 minutes
- Registration: 3 attempts / hour
- Password reset: 3 attempts / hour
- Security event logging

✅ **RBAC Enhancement**
- Role hierarchy implemented
- Higher roles inherit lower permissions
- Automatic permission propagation

✅ **Audit Logging**
- Cryptographic hash chains (blockchain-style)
- HMAC-SHA256 digital signatures
- Tamper detection
- Blocking failures (no silent errors)

✅ **Encryption**
- PBKDF2 600k iterations (OWASP 2023)
- Master key entropy validation
- Enhanced key derivation

### New Endpoints

**Audit Endpoints (6 new):**
- `GET /api/v1/organizations/:orgId/audit/suspicious-activity`
- `GET /api/v1/organizations/:orgId/audit/metrics`
- `GET /api/v1/organizations/:orgId/audit/compliance-metrics`
- `POST /api/v1/organizations/:orgId/audit/logs/export`
- `GET /api/v1/organizations/:orgId/audit/stream/config`
- `PUT /api/v1/organizations/:orgId/audit/stream/config`

### Compliance Improvements

| Standard | v1.0 | v2.0 | Change |
|----------|------|------|--------|
| **PCI DSS v4.0** | 65% | 90% | +25% |
| **SOC 2 Type II** | 70% | 85% | +15% |
| **PIPEDA (Canada)** | 75% | 95% | +20% |
| **Security Score** | 78/100 | 92/100 | +18% |

---

## 🔧 Testing

### Test Credentials (Development)

```javascript
const testUsers = {
  superAdmin: {
    email: 'admin@lifestreamdynamics.com',
    password: 'SuperAdmin123!'
  },
  admin: {
    email: 'manager@lifestreamdynamics.com',
    password: 'OrgAdmin123!'
  },
  manager: {
    email: 'sales@lifestreamdynamics.com',
    password: 'Manager123!'
  },
  accountant: {
    email: 'accounting@lifestreamdynamics.com',
    password: 'Accountant123!'
  }
};
```

### Testing Endpoints

```bash
# Development server
npm run dev

# Run integration tests
npm run test:integration

# Run RBAC tests
npm run test:rbac:full

# View API documentation
open http://localhost:3000/api-docs
```

---

## 📊 API Statistics

- **Total Endpoints:** 200+
- **Documented Endpoints:** 197 (OpenAPI spec)
- **Authentication Required:** 182 endpoints
- **Public Endpoints:** 18 (no auth)
- **Role-Protected Endpoints:** 164
- **Database Models:** 84 (Prisma)
- **Test Coverage:** 80%+ (unit), 85%+ (integration)
- **Security Score:** 92/100

---

## 🛠️ Tools & Resources

### Development Tools

```bash
# Generate API docs
npm run docs:generate

# Build static docs
npm run docs:build

# Serve live docs
npm run docs:serve

# View Swagger UI
npm run dev
# Then open: http://localhost:3000/api-docs
```

### Import API Spec

**Postman:**
1. File → Import
2. Select `docs/jsdoc-openapi.yaml`
3. Collections created automatically

**Insomnia:**
1. Application → Import/Export → Import Data
2. From File → Select `docs/jsdoc-openapi.yaml`

**VS Code (REST Client):**
```http
### Login
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@lifestreamdynamics.com",
  "password": "SuperAdmin123!"
}

### Get Customers (use token from login)
GET http://localhost:3000/api/v1/organizations/{{orgId}}/customers
Authorization: Bearer {{token}}
```

---

## 🔗 Quick Links

- **Interactive API Docs:** http://localhost:3000/api-docs
- **GitHub Repository:** https://github.com/lifestreamdynamics/accounting-api
- **Issue Tracker:** https://github.com/lifestreamdynamics/accounting-api/issues
- **Security Contact:** security@lifestreamdynamics.com
- **Support Email:** api-support@lifestreamdynamics.com

---

## 📞 Support

### Documentation
- **Full Index:** [INDEX.md](./INDEX.md)
- **Frontend Guide:** [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)
- **API Reference:** [api-docs.html](./api-docs.html)
- **OpenAPI Spec:** [jsdoc-openapi.yaml](./jsdoc-openapi.yaml)

### Getting Help
- **Bug Reports:** GitHub Issues
- **Security Issues:** security@lifestreamdynamics.com (PGP available)
- **API Support:** api-support@lifestreamdynamics.com
- **Feature Requests:** GitHub Discussions

### Version Support

| Version | Status | Support Until | Security Fixes |
|---------|--------|---------------|----------------|
| 2.0.0 | **Current** | Active | Yes |
| 1.0.0 | Supported | 2026-03-27 | Critical only |

---

## 🎯 Next Steps

1. **Read the [Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)**
2. **Review the [API Changelog](./API_CHANGELOG.md)** for v2.0 changes
3. **Import the [OpenAPI Spec](./jsdoc-openapi.yaml)** into your API client
4. **Test with the interactive [Swagger UI](http://localhost:3000/api-docs)**
5. **Implement session management** (2-hour tokens with auto-refresh)
6. **Handle rate limiting** (429 errors with retry-after)
7. **Update password validation** (12+ chars with complexity)

---

**Last Updated:** October 2, 2025
**API Version:** 2.0.0
**Documentation Version:** 2.0.0

Copyright © 2025 Lifestream Dynamics. All rights reserved.
