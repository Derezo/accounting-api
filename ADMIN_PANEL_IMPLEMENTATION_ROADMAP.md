# Admin Panel Backend Implementation Roadmap

**Created**: 2025-10-03
**Frontend Version**: accounting-frontend v1.0
**Backend Version**: accounting-api v1.0
**Priority**: HIGH - Frontend admin panel exists but backend endpoints missing

---

## 📋 Executive Summary

The frontend has a fully-built **System Administration Panel** (`/admin/system`) that expects centralized admin endpoints that do not currently exist in the backend. This document provides a complete implementation roadmap for backend engineers to build the missing API endpoints.

### Current Status
- **Frontend**: ✅ Complete UI implementation (SystemAdminPage.tsx, useSystemAdmin.ts hooks, types)
- **Backend**: ❌ Missing 90% of admin endpoints
- **Impact**: 404 errors flood console, admin features non-functional

---

## 🚨 Critical Path Fixes (Required Immediately)

### 1. Fix Organization Routes ✅ PARTIALLY COMPLETE

**Current State**: Endpoints exist but frontend was using wrong paths

| Frontend Expected | Backend Reality | Status | Action |
|-------------------|-----------------|--------|---------|
| `/admin/organizations` | `/organizations` | ✅ Fixed | Frontend updated to use `/organizations` |
| `/admin/system/health` | `/health` | ✅ Fixed | Frontend updated to use `/health` |

**No backend changes needed** - these endpoints already exist, frontend paths have been corrected.

---

## 📦 Phase 1: System Monitoring & Health (High Priority)

### 1.1 System Logs API

**Endpoints to implement:**
```typescript
GET    /admin/system/logs              // Get paginated logs with filters
GET    /admin/system/logs/stream       // Real-time log streaming
DELETE /admin/system/logs              // Clear old logs
```

**Request/Response Schemas:**

```typescript
// GET /admin/system/logs
interface SystemLogFilters {
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  source?: string              // Service name (e.g., 'auth', 'invoice')
  startDate?: string           // ISO 8601
  endDate?: string             // ISO 8601
  search?: string              // Search in message text
  page?: number
  limit?: number
}

interface SystemLog {
  id: string
  timestamp: string            // ISO 8601
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  message: string
  source: string               // Service/module name
  userId?: string              // If user-triggered
  organizationId?: string      // Tenant context
  metadata?: Record<string, any>
  stackTrace?: string          // For errors
}

interface SystemLogsResponse {
  data: SystemLog[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}
```

**Implementation Notes:**
- Store logs in separate `system_logs` table or use logging service (Winston/Pino)
- Index on `timestamp`, `level`, `source` for fast queries
- Implement log rotation (delete logs older than 90 days)
- SUPER_ADMIN permission required
- Real-time streaming can use WebSocket or Server-Sent Events

**Database Schema:**
```sql
CREATE TABLE system_logs (
  id VARCHAR(255) PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(100) NOT NULL,
  user_id VARCHAR(255),
  organization_id VARCHAR(255),
  metadata JSONB,
  stack_trace TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp),
  INDEX idx_level (level),
  INDEX idx_source (source)
);
```

---

### 1.2 Enhanced Health Check API

**Endpoints to implement:**
```typescript
GET /admin/system/health   // Comprehensive health check
```

**Current `/health` endpoint returns:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-03T12:00:00Z"
}
```

**Enhanced `/admin/system/health` should return:**
```typescript
interface SystemHealth {
  status: 'HEALTHY' | 'WARNING' | 'ERROR' | 'MAINTENANCE'
  timestamp: string
  uptime: number               // Hours
  version: string              // API version

  // Resource utilization
  cpu: {
    usage: number              // Percentage 0-100
    cores: number
  }
  memory: {
    usage: number              // Percentage 0-100
    total: number              // Bytes
    used: number               // Bytes
  }
  disk: {
    usage: number              // Percentage 0-100
    total: number              // Bytes
    used: number               // Bytes
  }

  // Service health
  services: ServiceHealth[]

  // Performance metrics
  metrics: {
    requestsPerSecond: number
    averageResponseTime: number  // Milliseconds
    errorRate: number            // Percentage
  }
}

interface ServiceHealth {
  name: string                 // e.g., 'database', 'redis', 'email'
  status: 'HEALTHY' | 'WARNING' | 'ERROR' | 'MAINTENANCE'
  responseTime: number         // Milliseconds
  lastChecked: string          // ISO 8601
  message?: string             // Status message
}
```

**Implementation Notes:**
- Use `os` module to get CPU/memory/disk stats
- Check database connection, Redis, external services
- Cache health data for 10 seconds to avoid excessive checks
- SUPER_ADMIN permission required

---

## 📦 Phase 2: System Integrations Management (Medium Priority)

### 2.1 Integration Management API

**Endpoints to implement:**
```typescript
GET    /admin/integrations           // List all integrations
GET    /admin/integrations/:id       // Get integration details
POST   /admin/integrations           // Create new integration
PUT    /admin/integrations/:id       // Update integration
DELETE /admin/integrations/:id       // Delete integration
POST   /admin/integrations/:id/test  // Test integration connection
```

**Request/Response Schemas:**

```typescript
interface SystemIntegration {
  id: string
  name: string
  type: 'STRIPE' | 'QUICKBOOKS' | 'SENDGRID' | 'TWILIO' | 'SLACK' | 'CUSTOM'
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'TESTING'
  enabled: boolean

  // Configuration (encrypted in database)
  config: {
    apiKey?: string              // Encrypted
    apiSecret?: string           // Encrypted
    webhookUrl?: string
    callbackUrl?: string
    scope?: string[]
    customFields?: Record<string, any>
  }

  // Monitoring
  lastSync?: string              // ISO 8601
  lastError?: string
  syncFrequency?: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MANUAL'

  // Metadata
  organizationId?: string        // Null for system-wide
  createdAt: string
  updatedAt: string
  createdBy: string
}

interface CreateIntegrationRequest {
  name: string
  type: string
  enabled: boolean
  config: Record<string, any>
  organizationId?: string        // Optional - system-wide if omitted
}
```

**Implementation Notes:**
- Store sensitive credentials using encryption (use `crypto` module or KMS)
- Test connections before saving
- Validate webhook signatures
- SUPER_ADMIN permission for system-wide, ADMIN for org-specific
- Support both org-scoped and system-wide integrations

**Database Schema:**
```sql
CREATE TABLE system_integrations (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  enabled BOOLEAN DEFAULT false,
  config_encrypted TEXT NOT NULL,  -- Encrypted JSON
  last_sync TIMESTAMP,
  last_error TEXT,
  sync_frequency VARCHAR(20),
  organization_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_organization (organization_id)
);
```

---

## 📦 Phase 3: Maintenance Windows (Medium Priority)

### 3.1 Maintenance Window API

**Endpoints to implement:**
```typescript
GET    /admin/maintenance-windows                // List all windows
GET    /admin/maintenance-windows/:id            // Get window details
POST   /admin/maintenance-windows                // Schedule new window
PUT    /admin/maintenance-windows/:id            // Update window
POST   /admin/maintenance-windows/:id/start      // Start maintenance
POST   /admin/maintenance-windows/:id/complete   // Complete maintenance
POST   /admin/maintenance-windows/:id/cancel     // Cancel window
```

**Request/Response Schemas:**

```typescript
interface MaintenanceWindow {
  id: string
  title: string
  description: string
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

  // Schedule
  scheduledStart: string         // ISO 8601
  scheduledEnd: string           // ISO 8601
  actualStart?: string           // ISO 8601
  actualEnd?: string             // ISO 8601
  duration: number               // Estimated minutes

  // Impact
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  affectedServices: string[]     // Array of service names
  notifyUsers: boolean

  // Details
  tasks: MaintenanceTask[]
  notes?: string
  completionNotes?: string

  // Metadata
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface MaintenanceTask {
  id: string
  description: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  assignedTo?: string
  completedAt?: string
}

interface CreateMaintenanceWindowRequest {
  title: string
  description: string
  scheduledStart: string
  scheduledEnd: string
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  affectedServices: string[]
  notifyUsers: boolean
  tasks: Array<{ description: string; assignedTo?: string }>
}
```

**Implementation Notes:**
- Send email notifications to admins when maintenance is scheduled
- Optionally put system in maintenance mode during window
- Track task completion
- SUPER_ADMIN permission required

**Database Schema:**
```sql
CREATE TABLE maintenance_windows (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL,
  scheduled_start TIMESTAMP NOT NULL,
  scheduled_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  duration INTEGER,
  impact VARCHAR(20) NOT NULL,
  affected_services JSONB,
  notify_users BOOLEAN DEFAULT false,
  tasks JSONB,
  notes TEXT,
  completion_notes TEXT,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_scheduled_start (scheduled_start)
);
```

---

## 📦 Phase 4: System Analytics (Low Priority)

### 4.1 System-Wide Analytics API

**Endpoints to implement:**
```typescript
GET  /admin/analytics             // Get system-wide analytics
POST /admin/analytics/export      // Export analytics report
```

**Note**: Payment analytics already exists at `/organizations/:id/payment-analytics`

**Request/Response Schemas:**

```typescript
interface SystemAnalytics {
  // Tenant metrics
  totalOrganizations: number
  activeOrganizations: number
  suspendedOrganizations: number
  newOrganizationsThisMonth: number

  // User metrics
  totalUsers: number
  activeUsersToday: number
  activeUsersThisWeek: number
  activeUsersThisMonth: number
  usersByRole: Record<string, number>

  // Financial metrics
  totalRevenue: number
  monthlyRecurringRevenue: number
  averageRevenuePerOrganization: number

  // Subscription metrics
  activeSubscriptions: number
  subscriptionsByPlan: Record<string, number>
  churnRate: number              // Percentage

  // Usage metrics
  apiCalls: number               // Last 24h
  storageUsed: number            // Bytes
  bandwidthUsed: number          // Bytes

  // Performance
  averageResponseTime: number    // Milliseconds
  errorRate: number              // Percentage
  uptimePercentage: number       // Last 30 days

  // Period
  periodStart: string            // ISO 8601
  periodEnd: string              // ISO 8601
}
```

**Implementation Notes:**
- Aggregate data from multiple sources (orgs, users, subscriptions)
- Cache analytics data for 1 hour
- Support date range filtering
- Export to PDF/Excel/CSV
- SUPER_ADMIN permission required

---

## 📦 Phase 5: Feature Toggles (Low Priority)

### 5.1 Feature Toggle Management API

**Endpoints to implement:**
```typescript
GET    /admin/feature-toggles       // List all feature toggles
GET    /admin/feature-toggles/:id   // Get toggle details
POST   /admin/feature-toggles       // Create new toggle
PUT    /admin/feature-toggles/:id   // Update toggle
DELETE /admin/feature-toggles/:id   // Delete toggle
```

**Request/Response Schemas:**

```typescript
interface FeatureToggle {
  id: string
  key: string                    // Unique key (e.g., 'beta_dashboard')
  name: string                   // Human-readable name
  description: string
  enabled: boolean

  // Targeting
  scope: 'GLOBAL' | 'ORGANIZATION' | 'USER'
  targetOrganizations?: string[] // If scope = ORGANIZATION
  targetUsers?: string[]         // If scope = USER
  rolloutPercentage?: number     // 0-100, gradual rollout

  // Metadata
  createdAt: string
  updatedAt: string
  createdBy: string
}

interface FeatureToggleRequest {
  key: string
  name: string
  description: string
  enabled: boolean
  scope: 'GLOBAL' | 'ORGANIZATION' | 'USER'
  targetOrganizations?: string[]
  targetUsers?: string[]
  rolloutPercentage?: number
}
```

**Implementation Notes:**
- Integrate with existing SystemPreferences.featureFlags
- Cache toggle states in Redis for fast access
- Provide middleware to check feature access
- SUPER_ADMIN permission required

**Database Schema:**
```sql
CREATE TABLE feature_toggles (
  id VARCHAR(255) PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  scope VARCHAR(20) NOT NULL,
  target_organizations JSONB,
  target_users JSONB,
  rollout_percentage INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  INDEX idx_key (key),
  INDEX idx_enabled (enabled)
);
```

---

## 📦 Phase 6: Subscription & Plan Management (Medium Priority)

### 6.1 Subscription Plans API

**Endpoints to implement:**
```typescript
GET    /admin/subscription-plans       // List all plans
GET    /admin/subscription-plans/:id   // Get plan details
POST   /admin/subscription-plans       // Create new plan
PUT    /admin/subscription-plans/:id   // Update plan
DELETE /admin/subscription-plans/:id   // Delete plan (soft delete)
```

**Request/Response Schemas:**

```typescript
interface SubscriptionPlan {
  id: string
  name: string                   // e.g., 'Professional', 'Enterprise'
  code: string                   // e.g., 'PRO', 'ENT'
  description: string

  // Pricing
  price: number                  // Monthly price
  billingCycle: 'MONTHLY' | 'YEARLY' | 'QUARTERLY'
  currency: string               // ISO 4217
  trialDays?: number

  // Limits
  limits: {
    maxUsers: number | null      // Null = unlimited
    maxStorage: number | null    // Bytes, null = unlimited
    maxAPICallsPerMonth: number | null
    maxOrganizations?: number    // For resellers
  }

  // Features
  features: string[]             // Array of feature keys

  // Status
  isActive: boolean
  isPublic: boolean              // Show on pricing page

  // Metadata
  createdAt: string
  updatedAt: string
}

interface CreateSubscriptionPlanRequest {
  name: string
  code: string
  description: string
  price: number
  billingCycle: 'MONTHLY' | 'YEARLY' | 'QUARTERLY'
  currency: string
  trialDays?: number
  limits: Record<string, number | null>
  features: string[]
  isActive: boolean
  isPublic: boolean
}
```

### 6.2 Subscription Management API

**Endpoints to implement:**
```typescript
GET    /admin/subscriptions               // List all subscriptions
GET    /admin/subscriptions/:id           // Get subscription details
PUT    /admin/subscriptions/:id           // Update subscription
POST   /admin/subscriptions/:id/cancel    // Cancel subscription
```

**Request/Response Schemas:**

```typescript
interface Subscription {
  id: string
  organizationId: string
  planId: string
  plan: SubscriptionPlan         // Populated

  // Status
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED'

  // Billing
  currentPeriodStart: string     // ISO 8601
  currentPeriodEnd: string       // ISO 8601
  cancelAt?: string              // ISO 8601
  cancelledAt?: string           // ISO 8601
  trialEnd?: string              // ISO 8601

  // Payment
  paymentMethod?: string         // Stripe payment method ID
  lastPaymentAt?: string
  nextPaymentAt?: string

  // Metadata
  createdAt: string
  updatedAt: string
}
```

**Implementation Notes:**
- Integrate with Stripe for payment processing
- Handle plan upgrades/downgrades
- Enforce limits based on subscription plan
- SUPER_ADMIN permission required

---

## 📦 Phase 7: System Users & Backup Management (Low Priority)

### 7.1 System Users API

**Endpoints to implement:**
```typescript
GET  /admin/users              // List all users (cross-organization)
POST /admin/users              // Create system user
PUT  /admin/users/:id/role     // Update user role
```

**Note**: This is different from `/organizations/:id/users` which is org-scoped

### 7.2 Backup Management API

**Endpoints to implement:**
```typescript
GET    /admin/backups                // List all backups
POST   /admin/backups                // Create manual backup
POST   /admin/backups/:id/restore    // Restore from backup
DELETE /admin/backups/:id            // Delete backup
```

---

## 📦 Phase 8: Intake Settings (High Priority for UX)

### 8.1 Intake Form Settings API

**Endpoints to implement:**
```typescript
GET /organizations/:organizationId/settings/intake
PUT /organizations/:organizationId/settings/intake
```

**Request/Response Schemas:**

```typescript
interface IntakeSettings {
  id: string
  organizationId: string

  // General settings
  enabled: boolean
  requireApproval: boolean
  notifyOnSubmission: boolean

  // Email notifications
  notificationEmails: string[]   // Admin emails to notify
  customerConfirmationEmail: boolean

  // Form configuration
  customFields: IntakeCustomField[]
  requiredFields: string[]

  // Branding
  thankYouMessage?: string
  redirectUrl?: string

  // Metadata
  createdAt: string
  updatedAt: string
}

interface IntakeCustomField {
  id: string
  label: string
  type: 'TEXT' | 'NUMBER' | 'EMAIL' | 'PHONE' | 'SELECT' | 'TEXTAREA' | 'DATE'
  required: boolean
  options?: string[]             // For SELECT type
  placeholder?: string
  defaultValue?: string
  order: number
}
```

**Implementation Notes:**
- Add to organization-settings.routes.ts
- Store in database (new table or add to OrganizationSettings)
- ADMIN or MANAGER permission required

---

## 🔐 Security & Permissions

All admin endpoints require authentication and authorization:

| Route Pattern | Required Permission | Notes |
|---------------|---------------------|-------|
| `/admin/organizations` | `SUPER_ADMIN` (Master Org) | Already implemented |
| `/admin/system/*` | `SUPER_ADMIN` | System-level operations |
| `/admin/integrations` | `SUPER_ADMIN` or `ADMIN` (org-scoped) | Depends on scope |
| `/admin/subscription-plans` | `SUPER_ADMIN` | System-level |
| `/admin/subscriptions` | `SUPER_ADMIN` | View all |
| `/admin/feature-toggles` | `SUPER_ADMIN` | System-level |
| `/admin/backups` | `SUPER_ADMIN` | System-level |
| `/organizations/:id/settings/intake` | `ADMIN` or `MANAGER` | Org-scoped |

---

## 🗂️ Database Migrations

Create migrations for new tables in order:

1. `system_logs` (Phase 1)
2. `system_integrations` (Phase 2)
3. `maintenance_windows` (Phase 3)
4. `subscription_plans` (Phase 6)
5. `subscriptions` (Phase 6)
6. `feature_toggles` (Phase 5)
7. `backups` (Phase 7)
8. Add `intake_settings` to `organization_settings` table (Phase 8)

---

## 📝 Implementation Checklist

### Phase 1 (Immediate)
- [ ] System Logs API (3 endpoints)
- [ ] Enhanced Health Check API
- [ ] Intake Settings API (2 endpoints)

### Phase 2 (This Sprint)
- [ ] Integration Management API (6 endpoints)
- [ ] Subscription Plans API (5 endpoints)
- [ ] Subscription Management API (4 endpoints)

### Phase 3 (Next Sprint)
- [ ] Maintenance Windows API (7 endpoints)
- [ ] System Analytics API (2 endpoints)

### Phase 4 (Future)
- [ ] Feature Toggles API (5 endpoints)
- [ ] System Users API (3 endpoints)
- [ ] Backup Management API (4 endpoints)

---

## 🧪 Testing Requirements

For each endpoint:
1. **Unit Tests**: Controller logic, validation, error handling
2. **Integration Tests**: Database operations, external service calls
3. **E2E Tests**: Full request/response cycle with authentication
4. **Load Tests**: Performance under high concurrency
5. **Security Tests**: Permission checks, input validation, SQL injection

---

## 📊 Success Metrics

- **0 console 404 errors** from admin panel
- **All admin UI features functional**
- **Response time < 200ms** for GET endpoints
- **Response time < 500ms** for POST/PUT endpoints
- **Test coverage > 90%** for admin controllers

---

## 🚀 Quick Start for Backend Engineers

1. **Review existing code**:
   - `src/routes/organization.routes.ts` - Reference implementation
   - `src/controllers/organization.controller.ts` - Controller pattern
   - `src/middleware/auth.middleware.ts` - Permission checks

2. **Create new route files**:
   ```
   src/routes/admin-system.routes.ts
   src/routes/admin-integrations.routes.ts
   src/routes/admin-maintenance.routes.ts
   ```

3. **Create controllers**:
   ```
   src/controllers/admin-system.controller.ts
   src/controllers/admin-integrations.controller.ts
   ```

4. **Add to app.ts**:
   ```typescript
   import adminSystemRoutes from './routes/admin-system.routes'
   app.use('/api/v1/admin/system', authenticate, requireMasterOrgSuperAdmin, adminSystemRoutes)
   ```

5. **Run tests**:
   ```bash
   npm test -- admin
   ```

---

## 📞 Questions?

Contact frontend team for clarification on:
- Expected data structures
- UI behavior requirements
- Priority adjustments

**Frontend team has implemented graceful degradation** - admin features will show empty states until backend endpoints are ready.

---

**Last Updated**: 2025-10-03
**Document Owner**: Frontend Engineering Team
**Backend POC**: TBD
