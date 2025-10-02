# Deployment Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ (production)
- Redis (optional, for caching)
- Domain with DNS access (for production)

## Environment Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd accounting-api
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration

Create `.env` file:
```env
# Application
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/accounting?schema=public"

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-token-secret-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=your-master-encryption-key-32-bytes
KEY_ROTATION_DAYS=90

# CORS
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=1000

# Payment Gateway (Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email Service
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
FROM_EMAIL=noreply@yourdomain.com

# File Storage
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Monitoring
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
```

## Database Setup

### 1. Run Migrations
```bash
npm run prisma:migrate
```

### 2. Seed Master Organization
```bash
npm run prisma:seed
```

This creates the master organization (Lifestream Dynamics) and super admin user.

## Build & Deploy

### Development
```bash
npm run dev
```

### Production Build
```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

## Docker Deployment

### Development
```bash
docker-compose up -d
```

### Production
```bash
docker-compose -f docker-compose.production.yml up -d
```

## Health Checks

Verify deployment:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-01T12:00:00.000Z",
  "uptime": 123.456,
  "environment": "production",
  "version": "1.0.0"
}
```

## SSL/TLS Setup

### Using Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring & Logging

### PM2 Process Manager
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/src/server.js --name accounting-api

# View logs
pm2 logs accounting-api

# Monitor
pm2 monit

# Restart
pm2 restart accounting-api

# Setup startup script
pm2 startup
pm2 save
```

### Log Aggregation
Logs are written to:
- stdout (captured by PM2/Docker)
- `logs/app.log` (file logging)
- `logs/error.log` (error logging)

## Backup Strategy

### Database Backups
```bash
# Daily backup
pg_dump -h localhost -U user accounting > backup-$(date +%Y%m%d).sql

# Restore
psql -h localhost -U user accounting < backup-20251001.sql
```

### Automated Backups
Set up cron job:
```cron
0 2 * * * /path/to/backup-script.sh
```

## Security Hardening

### 1. Firewall Rules
```bash
# Allow only necessary ports
ufw allow 443/tcp
ufw allow 80/tcp  # For Let's Encrypt
ufw enable
```

### 2. Database Security
- Use strong passwords
- Enable SSL connections
- Restrict database access to application server IPs
- Regular security updates

### 3. Application Security
- Keep dependencies updated: `npm audit`
- Use environment variables for secrets
- Enable rate limiting
- Configure CORS properly
- Use HTTPS only in production

## Scaling Strategies

### Horizontal Scaling
1. Deploy multiple API instances
2. Use load balancer (Nginx, HAProxy, AWS ALB)
3. Share database and Redis connections
4. Session-less architecture (JWT tokens)

### Vertical Scaling
- Increase server resources (CPU, RAM)
- Optimize database queries
- Enable caching layer

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Check database status
sudo systemctl status postgresql

# Check connection
psql -h localhost -U user -d accounting
```

**Permission Errors**
```bash
# Fix file permissions
chown -R node:node /app
chmod -R 755 /app
```

**Memory Issues**
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## Rollback Procedure

### 1. Stop Application
```bash
pm2 stop accounting-api
```

### 2. Restore Database
```bash
psql -h localhost -U user accounting < backup-previous.sql
```

### 3. Deploy Previous Version
```bash
git checkout <previous-version>
npm install
npm run build
pm2 restart accounting-api
```

## Performance Optimization

### Database
- Regular VACUUM and ANALYZE
- Index optimization
- Connection pooling
- Read replicas for reporting

### Application
- Enable compression (gzip)
- Implement caching (Redis)
- Use CDN for static assets
- Optimize payload sizes

## Compliance & Auditing

### GDPR Compliance
- Data encryption at rest and in transit
- Right to be forgotten (soft deletes)
- Data export capabilities
- Audit logging

### PCI Compliance
- Never store raw card data
- Use Stripe for payment processing
- Encrypt sensitive payment information
- Regular security audits

---

**Last Updated**: 2025-10-01
**Deployment Version**: 1.0
