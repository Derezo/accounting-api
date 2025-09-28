# Development Credentials

## User Accounts for Testing

All passwords follow the pattern: `[Role]123!`

### Acme Corporation (acme.dev)

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| **Super Admin** | admin@acme.dev | SuperAdmin123! | Full system access across all organizations |
| **Org Admin** | manager@acme.dev | OrgAdmin123! | Full access within Acme Corporation |
| **Manager** | sales@acme.dev | Manager123! | Manage customers, quotes, invoices, projects |
| **Accountant** | accounting@acme.dev | Accountant123! | Financial operations and reporting |
| **Employee** | employee@acme.dev | Employee123! | Limited access to assigned tasks |
| **Viewer** | viewer@acme.dev | Viewer123! | Read-only access to organization data |

### TechSolutions Inc (techsolutions.dev)

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| **Admin** | admin@techsolutions.dev | TechAdmin123! | Full access within TechSolutions Inc |

## Quick API Testing

### Health Checks
```bash
# Basic health check
curl http://localhost:3000/health

# API health check
curl http://localhost:3000/api/v1/health

# Database health check
curl http://localhost:3000/health/db
```

### Authentication
```bash
# Login example
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@acme.dev",
    "password": "SuperAdmin123!",
    "organizationId": "org_acme_corp_001"
  }'
```

### Using JWT Token
```bash
# Replace TOKEN with the accessToken from login response
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/v1/customers
```

## Organization IDs

- **Acme Corporation**: `org_acme_corp_001`
- **TechSolutions Inc**: `org_tech_solutions_002`

## Role Hierarchy

1. **SUPER_ADMIN** - System-wide access, can manage all organizations
2. **ADMIN** - Full access within their organization
3. **MANAGER** - Department-level management permissions
4. **ACCOUNTANT** - Financial operations focus
5. **EMPLOYEE** - Task-specific access
6. **VIEWER** - Read-only access

## Multi-Tenant Testing

Each organization is completely isolated:
- Users can only access data within their organization
- API endpoints enforce organization-based filtering
- Cross-organization data access is prevented

## Development Tools

- **API Documentation**: http://127.0.0.1:8080 (ReDoc interface)
- **Database**: SQLite at `prisma/dev.db`
- **Prisma Studio**: `npm run prisma:studio`

## Seed Data

To regenerate seed data:
```bash
npm run prisma:seed  # Uses prisma/seed-dev.ts
```

## Security Notes

⚠️ **For development only!** These credentials use predictable passwords and should never be used in production environments.

- All passwords are hashed with bcrypt (12 rounds)
- JWT tokens have configurable expiration
- Rate limiting is enforced on authentication endpoints
- Organization isolation is strictly enforced