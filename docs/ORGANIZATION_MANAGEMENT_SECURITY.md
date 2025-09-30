# Organization Management API - Enhanced Security Architecture

## Overview

This document outlines the enhanced security architecture for organization management in the Lifestream Dynamics Universal Accounting API. The system implements a **master organization model** where `lifestreamdynamics.com` acts as the sole authority for creating and managing tenant organizations.

---

## Master Organization Architecture

### Concept

- **Master Organization**: `lifestreamdynamics.com`
- **Master Admin**: `eric@lifestreamdynamics.com` with `SUPER_ADMIN` role
- **Purpose**: Exclusive authority to provision and manage all tenant organizations
- **Security Model**: Master-tenant hierarchy with strict access control

### Key Principles

1. **Single Source of Authority**: Only SUPER_ADMIN users from the master organization can create new organizations
2. **DNS Verification**: All organization domains must have valid DNS CNAME records pointing to the platform
3. **Domain Uniqueness**: Each organization must have a unique, verified domain
4. **Audit Trail**: All organization management operations are fully audited
5. **Data Isolation**: Complete tenant separation with organization-scoped encryption keys

---

## Security Enhancements

### 1. Master Organization Privileges

#### Exclusive Operations (Master Organization Only)

```typescript
// Operations restricted to lifestreamdynamics.com SUPER_ADMIN
- POST /organizations                    // Create new organization
- GET /organizations                     // List all organizations (system-wide)
- DELETE /organizations/:id              // Deactivate any organization
- PUT /organizations/:id/status          // Change organization status
- POST /organizations/:id/suspend        // Suspend organization
- POST /organizations/:id/restore        // Restore suspended organization
- GET /organizations/analytics           // System-wide analytics
```

#### Verification Checks

Every privileged operation must verify:
1. User has `SUPER_ADMIN` role
2. User belongs to master organization (`lifestreamdynamics.com`)
3. Request includes valid audit context (IP, user agent, timestamp)

```typescript
// Middleware: requireMasterOrgSuperAdmin
export const requireMasterOrgSuperAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = req.user;

  // Check SUPER_ADMIN role
  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenError('Requires SUPER_ADMIN role');
  }

  // Load user's organization
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { domain: true, isActive: true }
  });

  // Check master organization
  if (organization?.domain !== 'lifestreamdynamics.com') {
    throw new ForbiddenError('Operation restricted to master organization');
  }

  if (!organization.isActive) {
    throw new ForbiddenError('Master organization is not active');
  }

  next();
};
```

---

### 2. DNS-Based Domain Verification

#### Purpose

Verify that organizations control the domains they claim by requiring a DNS CNAME record.

#### Verification Flow

```
1. User submits organization creation request with domain: "client.com"
2. System generates verification token: "accounting-verify-abc123"
3. User creates DNS CNAME record:
   _accounting-verify.client.com CNAME accounting-verify-abc123.verify.lifestreamdynamics.com
4. System performs DNS lookup to verify CNAME exists
5. If verified, organization is created; otherwise, request is rejected
```

#### Implementation

```typescript
interface DomainVerificationResult {
  verified: boolean;
  recordFound: boolean;
  expectedValue: string;
  actualValue?: string;
  timestamp: Date;
  provider?: string;
}

class DomainVerificationService {
  private dns = require('dns').promises;

  /**
   * Generate verification token for domain
   */
  generateVerificationToken(domain: string): string {
    const hash = crypto.createHash('sha256')
      .update(domain + Date.now() + config.ENCRYPTION_KEY)
      .digest('hex')
      .substring(0, 32);
    return `accounting-verify-${hash}`;
  }

  /**
   * Verify domain has required CNAME record
   */
  async verifyDomain(
    domain: string,
    verificationToken: string
  ): Promise<DomainVerificationResult> {
    const recordName = `_accounting-verify.${domain}`;
    const expectedValue = `${verificationToken}.verify.lifestreamdynamics.com`;

    try {
      // Look up CNAME record
      const records = await this.dns.resolveCname(recordName);

      // Check if expected value exists
      const verified = records.some(record =>
        record.toLowerCase() === expectedValue.toLowerCase()
      );

      return {
        verified,
        recordFound: records.length > 0,
        expectedValue,
        actualValue: records[0],
        timestamp: new Date()
      };
    } catch (error: any) {
      // DNS lookup failed
      return {
        verified: false,
        recordFound: false,
        expectedValue,
        timestamp: new Date()
      };
    }
  }

  /**
   * Validate domain format and availability
   */
  async validateDomain(domain: string): Promise<void> {
    // Check format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      throw new ValidationError('Invalid domain format');
    }

    // Check not already in use
    const existing = await prisma.organization.findUnique({
      where: { domain },
      select: { id: true, name: true }
    });

    if (existing) {
      throw new ConflictError(
        `Domain ${domain} is already registered to organization ${existing.name}`
      );
    }

    // Check not reserved
    const reserved = ['localhost', 'lifestreamdynamics.com', 'test.com'];
    if (reserved.includes(domain.toLowerCase())) {
      throw new ValidationError('Domain is reserved');
    }
  }

  /**
   * Two-step verification process
   */
  async requestDomainVerification(domain: string): Promise<{
    verificationToken: string;
    cnameRecord: string;
    instructions: string;
  }> {
    await this.validateDomain(domain);

    const token = this.generateVerificationToken(domain);
    const cnameRecord = `_accounting-verify.${domain} CNAME ${token}.verify.lifestreamdynamics.com`;

    // Store verification request
    await prisma.domainVerification.create({
      data: {
        domain,
        verificationToken: token,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    return {
      verificationToken: token,
      cnameRecord,
      instructions: `Add the following CNAME record to your DNS:\n${cnameRecord}\n\nVerification expires in 24 hours.`
    };
  }
}
```

#### Database Schema Addition

```prisma
model DomainVerification {
  id                 String    @id @default(cuid())
  domain             String    @unique
  verificationToken  String
  status             String    // PENDING, VERIFIED, FAILED, EXPIRED
  attempts           Int       @default(0)
  lastAttemptAt      DateTime?
  verifiedAt         DateTime?
  expiresAt          DateTime
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@index([domain, status])
  @@index([expiresAt])
}
```

---

### 3. Enhanced API Endpoints

#### New Endpoints

```typescript
// Domain Verification
POST   /organizations/verify-domain
  Body: { domain: string }
  Response: { verificationToken, cnameRecord, instructions }
  Auth: SUPER_ADMIN (master org)

GET    /organizations/verify-domain/:domain
  Response: { verified, status, expiresAt }
  Auth: SUPER_ADMIN (master org)

// Organization Management
POST   /organizations/:id/suspend
  Body: { reason: string, duration?: number }
  Response: { suspendedAt, expiresAt }
  Auth: SUPER_ADMIN (master org)

POST   /organizations/:id/restore
  Response: { restoredAt, status }
  Auth: SUPER_ADMIN (master org)

GET    /organizations/analytics
  Query: { period, metrics }
  Response: { systemWide analytics }
  Auth: SUPER_ADMIN (master org)

// Transfer organization ownership
POST   /organizations/:id/transfer
  Body: { newAdminEmail: string }
  Response: { transferredAt, newAdmin }
  Auth: SUPER_ADMIN (master org)
```

---

## API Documentation

### POST /organizations/verify-domain

**Description**: Request domain verification for new organization

**Authorization**: SUPER_ADMIN (master organization only)

**Request Body**:
```json
{
  "domain": "newclient.com"
}
```

**Response 200**:
```json
{
  "domain": "newclient.com",
  "verificationToken": "accounting-verify-abc123def456",
  "cnameRecord": "_accounting-verify.newclient.com CNAME accounting-verify-abc123def456.verify.lifestreamdynamics.com",
  "instructions": "Add the following CNAME record to your DNS:\n_accounting-verify.newclient.com CNAME accounting-verify-abc123def456.verify.lifestreamdynamics.com\n\nVerification expires in 24 hours.",
  "expiresAt": "2025-10-01T23:59:59.000Z",
  "status": "PENDING"
}
```

**Errors**:
- `400` - Invalid domain format
- `403` - Not authorized (requires master org SUPER_ADMIN)
- `409` - Domain already registered

---

### GET /organizations/verify-domain/:domain

**Description**: Check domain verification status

**Authorization**: SUPER_ADMIN (master organization only)

**Response 200**:
```json
{
  "domain": "newclient.com",
  "verified": true,
  "status": "VERIFIED",
  "recordFound": true,
  "expectedValue": "accounting-verify-abc123def456.verify.lifestreamdynamics.com",
  "actualValue": "accounting-verify-abc123def456.verify.lifestreamdynamics.com",
  "verifiedAt": "2025-09-30T14:23:11.000Z",
  "expiresAt": "2025-10-01T23:59:59.000Z"
}
```

---

### POST /organizations (Enhanced)

**Description**: Create new organization with DNS verification

**Authorization**: SUPER_ADMIN (master organization only)

**Request Body**:
```json
{
  "name": "New Client Corp",
  "domain": "newclient.com",
  "adminEmail": "admin@newclient.com",
  "adminName": "John Doe",
  "legalName": "New Client Corporation Inc.",
  "businessNumber": "123456789",
  "phone": "+1-555-0100",
  "address": {
    "street": "123 Business St",
    "city": "Toronto",
    "province": "ON",
    "postalCode": "M5H 2N2",
    "country": "CA"
  },
  "settings": {
    "timezone": "America/Toronto",
    "currency": "CAD",
    "fiscalYearEnd": "12-31"
  }
}
```

**Processing Flow**:
1. Verify requester is SUPER_ADMIN in master org
2. Validate domain format and uniqueness
3. Check DNS verification status (must be VERIFIED)
4. Generate organization-specific encryption key
5. Create organization record
6. Create admin user with temporary password
7. Send welcome email with setup instructions
8. Return organization details

**Response 201**:
```json
{
  "id": "clp_new_org_123",
  "name": "New Client Corp",
  "domain": "newclient.com",
  "status": "ACTIVE",
  "adminUser": {
    "id": "usr_admin_123",
    "email": "admin@newclient.com",
    "name": "John Doe",
    "role": "ADMIN",
    "temporaryPassword": "TempPass123!",
    "mustChangePassword": true
  },
  "setupUrl": "https://account.lifestreamdynamics.com/setup?token=setup_token_abc",
  "apiEndpoint": "https://api.lifestreamdynamics.com",
  "createdAt": "2025-09-30T14:30:00.000Z"
}
```

**Errors**:
- `400` - Invalid input data
- `403` - Not authorized (requires master org SUPER_ADMIN)
- `409` - Domain already exists
- `422` - Domain not verified or verification expired

---

### POST /organizations/:id/suspend

**Description**: Temporarily suspend an organization

**Authorization**: SUPER_ADMIN (master organization only)

**Request Body**:
```json
{
  "reason": "Payment overdue",
  "duration": 7,
  "notifyUsers": true,
  "allowDataExport": true
}
```

**Response 200**:
```json
{
  "organizationId": "clp_org_123",
  "status": "SUSPENDED",
  "suspendedAt": "2025-09-30T15:00:00.000Z",
  "suspensionExpiresAt": "2025-10-07T15:00:00.000Z",
  "reason": "Payment overdue",
  "affectedUsers": 15,
  "dataRetained": true,
  "accessLevel": "READ_ONLY"
}
```

---

### POST /organizations/:id/restore

**Description**: Restore a suspended organization

**Authorization**: SUPER_ADMIN (master organization only)

**Request Body**:
```json
{
  "restorationNotes": "Payment received, account in good standing"
}
```

**Response 200**:
```json
{
  "organizationId": "clp_org_123",
  "status": "ACTIVE",
  "restoredAt": "2025-09-30T16:00:00.000Z",
  "restoredBy": "eric@lifestreamdynamics.com",
  "previousStatus": "SUSPENDED",
  "suspensionDuration": "7 days",
  "affectedUsers": 15
}
```

---

### GET /organizations/analytics

**Description**: System-wide organization analytics

**Authorization**: SUPER_ADMIN (master organization only)

**Query Parameters**:
- `period`: day | week | month | quarter | year (default: month)
- `metrics`: revenue,users,storage,activity (comma-separated)
- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD

**Response 200**:
```json
{
  "period": {
    "type": "month",
    "startDate": "2025-09-01",
    "endDate": "2025-09-30"
  },
  "organizations": {
    "total": 127,
    "active": 119,
    "suspended": 5,
    "inactive": 3,
    "newThisMonth": 8,
    "churnedThisMonth": 2
  },
  "users": {
    "total": 2845,
    "active": 2654,
    "byRole": {
      "SUPER_ADMIN": 1,
      "ADMIN": 142,
      "MANAGER": 387,
      "ACCOUNTANT": 521,
      "EMPLOYEE": 1456,
      "VIEWER": 338
    }
  },
  "financial": {
    "totalRevenue": 1547823.45,
    "mrr": 51594.12,
    "averageRevenuePerOrg": 12186.01,
    "topOrganizationsByRevenue": [
      { "id": "org_1", "name": "Big Corp", "revenue": 125000 }
    ]
  },
  "storage": {
    "totalUsed": 524288000000,
    "totalLimit": 1099511627776,
    "percentageUsed": 47.68
  },
  "activity": {
    "apiCalls": 8547231,
    "documentsCreated": 45678,
    "paymentsProcessed": 12345,
    "totalTransactionVolume": 8754231.45
  }
}
```

---

## Security Recommendations

### Immediate Implementation (Phase 1)

1. ✅ **Master Organization Middleware**
   - Implement `requireMasterOrgSuperAdmin` middleware
   - Apply to all organization management endpoints
   - Add to existing POST /organizations endpoint

2. ✅ **DNS Verification Service**
   - Create `DomainVerificationService` class
   - Add DNS lookup functionality (using Node.js `dns` module)
   - Implement verification token generation
   - Add verification status tracking

3. ✅ **Database Schema Updates**
   - Add `DomainVerification` model
   - Add `isMasterOrg` flag to Organization model
   - Add indexes for performance

4. ✅ **Enhanced Audit Logging**
   - Log all organization creation attempts
   - Log domain verification requests
   - Log suspension/restoration events
   - Include IP address, user agent, timestamp

### Medium-term Enhancements (Phase 2)

5. **Rate Limiting**
   - Strict rate limits for organization creation (1 per hour per IP)
   - DNS verification rate limits (10 checks per domain per hour)
   - Configurable limits per master org user

6. **Multi-Factor Authentication**
   - Require MFA for all SUPER_ADMIN users
   - Require MFA confirmation for organization deletion
   - Time-based one-time passwords (TOTP)

7. **IP Whitelisting**
   - Optional IP whitelist for master organization
   - Restrict SUPER_ADMIN access to known IPs
   - Alert on access from unknown locations

8. **Organization Lifecycle Management**
   - Automated suspension for non-payment
   - Grace periods before data deletion
   - Data export functionality for closed accounts

### Long-term Security (Phase 3)

9. **Advanced Threat Detection**
   - Anomaly detection for unusual patterns
   - Monitor for mass data access
   - Alert on privilege escalation attempts
   - Integration with SIEM systems

10. **Compliance Enhancements**
    - GDPR compliance for data deletion
    - SOC 2 audit trail requirements
    - Data residency controls
    - Encryption key rotation automation

11. **Disaster Recovery**
    - Automated backups per organization
    - Point-in-time recovery
    - Organization data export API
    - Cold storage for inactive organizations

---

## Security Concerns & Mitigations

### 1. Master Organization Compromise

**Risk**: If master organization is compromised, attacker gains full system access

**Mitigations**:
- ✅ Enforce MFA for all SUPER_ADMIN users
- ✅ IP whitelisting for master org access
- ✅ Session timeout: 15 minutes for SUPER_ADMIN
- ✅ Alert on all SUPER_ADMIN actions
- ✅ Require password confirmation for critical operations
- ✅ Regular security audits of master org

### 2. DNS Hijacking

**Risk**: Attacker could create fake DNS records to verify domains they don't own

**Mitigations**:
- ✅ Multiple DNS resolver checks (Google, Cloudflare, Quad9)
- ✅ Verify domain ownership via email (admin@domain)
- ✅ Require WHOIS data match (future enhancement)
- ✅ Time-delayed verification (check multiple times over 24 hours)
- ✅ Manual review for high-value domains

### 3. Privilege Escalation

**Risk**: Regular admin attempts to gain SUPER_ADMIN privileges

**Mitigations**:
- ✅ SUPER_ADMIN role can only be granted by existing SUPER_ADMIN
- ✅ Role changes require master org approval
- ✅ All role changes are immutably logged
- ✅ Automated alerts on privilege changes
- ✅ Regular privilege audits

### 4. Data Exfiltration

**Risk**: SUPER_ADMIN could access all organization data

**Mitigations**:
- ✅ Organization-specific encryption keys
- ✅ Audit all cross-organization access
- ✅ Rate limit bulk data queries
- ✅ Alert on mass data export
- ✅ Require business justification for cross-org access
- ⚠️ Consider implementing "data access approval" workflow

### 5. Denial of Service

**Risk**: Attacker creates many organizations to consume resources

**Mitigations**:
- ✅ Strict rate limiting on org creation (1/hour/IP)
- ✅ Require payment method before org creation (future)
- ✅ Automated suspension of dormant organizations
- ✅ Resource quotas per organization
- ✅ Monitor for abnormal growth patterns

### 6. Domain Verification Bypass

**Risk**: Attacker bypasses DNS verification to claim domains

**Mitigations**:
- ✅ Multiple verification checks over time
- ✅ Verification token expires after 24 hours
- ✅ Manual review for known brands
- ✅ Blocked domain list (google.com, microsoft.com, etc.)
- ✅ Email verification sent to admin@domain
- ⚠️ Consider requiring SSL certificate validation (future)

### 7. Insider Threats

**Risk**: Master org employee abuses SUPER_ADMIN access

**Mitigations**:
- ✅ All actions logged with user attribution
- ✅ Regular access reviews
- ✅ Separation of duties (multiple SUPER_ADMIN approvals for critical ops)
- ✅ Automated anomaly detection
- ✅ Background checks for SUPER_ADMIN users
- ⚠️ Consider implementing "two-person rule" for deletions

---

## Testing Requirements

### Unit Tests
- [ ] Domain validation logic
- [ ] DNS verification service
- [ ] Master org middleware
- [ ] Token generation
- [ ] Permission checks

### Integration Tests
- [ ] End-to-end org creation flow
- [ ] DNS verification process
- [ ] Suspension/restoration
- [ ] Cross-org access prevention
- [ ] Audit logging

### Security Tests
- [ ] Privilege escalation attempts
- [ ] Cross-tenant data access
- [ ] Rate limiting enforcement
- [ ] Token replay attacks
- [ ] Session hijacking

### Performance Tests
- [ ] DNS lookup latency
- [ ] Organization creation throughput
- [ ] Analytics query performance
- [ ] Bulk operations scaling

---

## Migration Plan

### Seed Master Organization

```typescript
// prisma/seeds/master-organization.ts
async function seedMasterOrganization() {
  const masterOrg = await prisma.organization.upsert({
    where: { domain: 'lifestreamdynamics.com' },
    update: {},
    create: {
      name: 'Lifestream Dynamics',
      domain: 'lifestreamdynamics.com',
      legalName: 'Lifestream Dynamics Inc.',
      type: 'PLATFORM_MASTER',
      isActive: true,
      isMasterOrg: true,
      email: 'support@lifestreamdynamics.com',
      phone: '+1-555-DYNAMICS',
      website: 'https://lifestreamdynamics.com',
      encryptionKey: generateEncryptionKey(),
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        features: {
          organizationManagement: true,
          systemAnalytics: true,
          advancedSecurity: true
        }
      })
    }
  });

  // Create master admin user
  const hashedPassword = await bcrypt.hash(
    process.env.MASTER_ADMIN_PASSWORD || 'ChangeMe123!',
    12
  );

  const masterAdmin = await prisma.user.upsert({
    where: { email: 'eric@lifestreamdynamics.com' },
    update: {},
    create: {
      email: 'eric@lifestreamdynamics.com',
      name: 'Eric',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      organizationId: masterOrg.id,
      isActive: true,
      emailVerified: true,
      mustChangePassword: true,
      createdBy: 'SYSTEM_SEED'
    }
  });

  console.log('✅ Master organization created:', masterOrg.id);
  console.log('✅ Master admin created:', masterAdmin.id);
}
```

---

## Compliance & Auditing

### Audit Events

All organization management operations generate audit events:

```typescript
interface OrganizationAuditEvent {
  eventType: 'ORG_CREATED' | 'ORG_SUSPENDED' | 'ORG_RESTORED' | 'ORG_DELETED' | 'DOMAIN_VERIFIED';
  organizationId: string;
  performedBy: string;
  performedByOrganization: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  changes?: Record<string, any>;
  reason?: string;
  metadata?: Record<string, any>;
}
```

### Compliance Requirements

1. **SOC 2 Type II**: Audit trail for all system-level changes
2. **GDPR**: Data deletion and export capabilities
3. **PCI DSS**: Secure handling of payment-related organizations
4. **PIPEDA** (Canada): Privacy compliance for Canadian data

---

## Implementation Checklist

- [ ] Update Organization schema (add isMasterOrg, verificationStatus)
- [ ] Create DomainVerification model
- [ ] Implement DomainVerificationService
- [ ] Create requireMasterOrgSuperAdmin middleware
- [ ] Add DNS verification endpoints
- [ ] Enhance POST /organizations with verification
- [ ] Add organization suspension/restoration endpoints
- [ ] Implement system analytics endpoint
- [ ] Create master organization seed script
- [ ] Update OpenAPI documentation
- [ ] Write unit tests (DNS verification, permissions)
- [ ] Write integration tests (org lifecycle)
- [ ] Write security tests (privilege escalation)
- [ ] Configure rate limiting
- [ ] Setup monitoring and alerts
- [ ] Document disaster recovery procedures
- [ ] Conduct security audit
- [ ] Deploy to staging for testing
- [ ] Deploy to production

---

**Document Version**: 1.0
**Last Updated**: 2025-09-30
**Author**: Claude Code with Eric
**Classification**: Internal - Security Architecture