# Security Enhancements Migration Guide

## Quick Migration Steps

### 1. Generate Audit Signing Key

```bash
# Generate a cryptographically secure random key
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and add to your `.env` file:

```bash
# .env
AUDIT_SIGNING_KEY=<paste-generated-key-here>
```

### 2. Apply Database Migration

**Option A: Using Prisma Migrate (Recommended)**
```bash
# This will apply the migration and update Prisma client
npm run prisma:migrate dev --name add_session_security_and_audit_chain
```

**Option B: Manual SQL Application**
```bash
# Apply SQL directly to SQLite database
sqlite3 prisma/dev.db < prisma/migrations/20250102_add_session_security_and_audit_chain.sql

# Then regenerate Prisma client
npm run prisma:generate
```

### 3. Verify Migration

```bash
# Check Session table schema
sqlite3 prisma/dev.db ".schema sessions"

# Should show:
# - deviceFingerprint TEXT NOT NULL
# - deviceInfo TEXT
# - lastActivityAt DATETIME NOT NULL

# Check AuditLog table schema
sqlite3 prisma/dev.db ".schema audit_logs"

# Should show:
# - previousHash TEXT
# - entryHash TEXT NOT NULL
# - signature TEXT NOT NULL  
# - sequenceNum INTEGER NOT NULL
```

### 4. Test the Changes

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Verify no breaking changes
npm run validate
```

### 5. Deploy to Production

```bash
# Build production bundle
npm run build:prod

# Start production server
npm run start:prod
```

## Post-Migration Tasks

### Verify Audit Chain Integrity

```typescript
import { auditService } from './services/audit.service';

// Verify audit chain for an organization
const result = await auditService.verifyAuditChainIntegrity('org-id');
console.log('Audit chain valid:', result.valid);
console.log('Total entries:', result.totalEntries);
console.log('Verified entries:', result.verifiedEntries);
```

### Force User Re-Login (Optional but Recommended)

To ensure all users have proper device fingerprinting:

```typescript
import { prisma } from './config/database';

// Delete all existing sessions (users will need to re-login)
await prisma.session.deleteMany({});
```

### Monitor Security Events

```bash
# Watch for IP mismatches
tail -f logs/security.log | grep "SESSION_IP_MISMATCH"

# Watch for device mismatches  
tail -f logs/security.log | grep "SESSION_DEVICE_MISMATCH"

# Watch for audit failures
tail -f logs/security.log | grep "CRITICAL: Audit"
```

## Rollback (If Needed)

### Rollback Database Changes

```sql
-- Remove session security fields
ALTER TABLE sessions DROP COLUMN deviceFingerprint;
ALTER TABLE sessions DROP COLUMN deviceInfo;
ALTER TABLE sessions DROP COLUMN lastActivityAt;
DROP INDEX IF EXISTS idx_sessions_lastActivityAt;
DROP INDEX IF EXISTS idx_sessions_deviceFingerprint;

-- Remove audit immutability fields
ALTER TABLE audit_logs DROP COLUMN previousHash;
ALTER TABLE audit_logs DROP COLUMN entryHash;
ALTER TABLE audit_logs DROP COLUMN signature;
ALTER TABLE audit_logs DROP COLUMN sequenceNum;
DROP INDEX IF EXISTS idx_audit_logs_sequenceNum;
DROP INDEX IF EXISTS idx_audit_logs_entryHash;
DROP INDEX IF EXISTS idx_audit_logs_signature;
```

### Rollback Code Changes

```bash
# Restore from backup
git checkout HEAD~1 src/services/auth.service.ts
git checkout HEAD~1 src/services/audit.service.ts
git checkout HEAD~1 src/services/encryption-key-manager.service.ts
git checkout HEAD~1 prisma/schema.prisma

# Regenerate Prisma client
npm run prisma:generate
```

## Environment Variables Summary

```bash
# Required (existing)
ENCRYPTION_KEY=<your-strong-master-key-32-chars-minimum>

# New (required for audit signatures)
AUDIT_SIGNING_KEY=<cryptographically-secure-random-key>

# Optional (HSM integration - future)
HSM_ENABLED=false
HSM_ENDPOINT=
HSM_ACCESS_KEY=
HSM_SECRET_KEY=
HSM_MASTER_KEY_ID=
```

## Production Deployment Checklist

- [ ] Generated and set `AUDIT_SIGNING_KEY` in production environment
- [ ] Reviewed master `ENCRYPTION_KEY` meets new validation requirements (32+ chars, variety, entropy)
- [ ] Applied database migration to production database
- [ ] Regenerated Prisma client on production server
- [ ] Deployed updated code to production
- [ ] Verified audit chain integrity on production
- [ ] Monitored session creation for 1 hour post-deployment
- [ ] Monitored audit log creation for 1 hour post-deployment
- [ ] Checked error logs for any migration-related issues
- [ ] Optionally forced user re-login for full device fingerprinting
- [ ] Updated monitoring/alerting for new security events
- [ ] Documented deployment in change log

## Troubleshooting

### Issue: "Master encryption key must be at least 32 characters"

**Solution:** Update your `ENCRYPTION_KEY` environment variable to be at least 32 characters with good entropy.

```bash
# Generate a strong key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Issue: "Audit signing key not set"

**Solution:** The system will fall back to using `ENCRYPTION_KEY` but you should set a dedicated `AUDIT_SIGNING_KEY`:

```bash
AUDIT_SIGNING_KEY=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo "AUDIT_SIGNING_KEY=$AUDIT_SIGNING_KEY" >> .env
```

### Issue: Sessions failing after migration

**Cause:** Existing sessions don't have device fingerprints.

**Solution:** Delete all sessions to force re-login:

```typescript
await prisma.session.deleteMany({});
```

### Issue: Audit chain verification failing

**Cause:** Pre-migration audit entries have placeholder hashes.

**Solution:** This is expected. The verification skips migrated entries automatically. Only new entries are fully verified.

## Support

For issues or questions:
1. Check `/SECURITY_ENHANCEMENTS_2025-01-02.md` for detailed documentation
2. Review migration SQL: `/prisma/migrations/20250102_add_session_security_and_audit_chain.sql`
3. Check service implementations for comments and documentation
