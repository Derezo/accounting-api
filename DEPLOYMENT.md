# Production Deployment Guide
## Lifestream Dynamics Universal Accounting API

This guide covers deploying the Accounting API to the production server at **mittonvillage.com**.

---

## 🖥️ Server Specifications

**Target Server:** mittonvillage.com
- **OS:** Ubuntu 24.04.3 LTS (Noble Numbat)
- **CPU:** 1 core
- **RAM:** 2GB (1.1GB available)
- **Disk:** 49GB total (34GB available)
- **Current Load:** Running multiple applications with Nginx

**Pre-installed Software:**
- Node.js v20.19.5 ✅
- Nginx 1.24.0 ✅
- PM2 process manager ✅

**Needs Installation:**
- PostgreSQL 16 (will be installed)

---

## 📋 Prerequisites

### 1. Update Environment Variables

Before deployment, you **MUST** update `.env.production` with secure values:

```bash
# Generate secure random strings
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For JWT_REFRESH_SECRET
openssl rand -hex 32  # For ENCRYPTION_KEY
openssl rand -hex 32  # For SESSION_SECRET

# Database password
openssl rand -base64 24  # For DB_PASSWORD
```

**Critical values to change in `.env.production`:**
- `DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `ENCRYPTION_KEY` - Field encryption key
- `SESSION_SECRET` - Session secret
- `STRIPE_SECRET_KEY` - Stripe production API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `SMTP_PASSWORD` - Email service password

### 2. Verify SSH Access

Ensure you have SSH access to the server:

```bash
ssh root@mittonvillage.com
```

### 3. Set File Permissions

Protect your environment file:

```bash
chmod 600 .env.production
```

---

## 🚀 Deployment Steps

### Step 1: Initial Server Setup (One-Time Only)

Run the installation script to set up all required software on the server:

```bash
./scripts/install-production.sh
```

**What it does:**
- ✅ Updates system packages
- ✅ Installs PostgreSQL 16
- ✅ Verifies/updates Node.js (requires v20+)
- ✅ Installs PM2 process manager
- ✅ Verifies Nginx installation
- ✅ Installs Certbot for SSL
- ✅ Creates application user (`accounting-api`)
- ✅ Creates directory structure
- ✅ Sets up PostgreSQL database and user
- ✅ Installs build tools and utilities
- ✅ Configures log rotation

**Expected output:**
```
╔════════════════════════════════════════════════════════════════╗
║     Accounting API - Production Installation Script           ║
║     Target: mittonvillage.com                                    ║
╚════════════════════════════════════════════════════════════════╝

[1/10] Updating system packages...
✓ System packages updated

[2/10] Checking PostgreSQL installation...
→ Installing PostgreSQL 16...
✓ PostgreSQL 16 installed and started

...

╔════════════════════════════════════════════════════════════════╗
║              Installation Complete!                            ║
╚════════════════════════════════════════════════════════════════╝

✓ All requirements installed successfully
```

**Duration:** ~5-10 minutes (first run)

---

### Step 2: Deploy Application

Deploy the application to production:

```bash
./scripts/deploy-production.sh
```

**What it does:**
- ✅ Runs pre-deployment checks
- ✅ Creates backup of existing deployment
- ✅ Builds application locally
- ✅ Runs tests
- ✅ Creates deployment package
- ✅ Uploads to server
- ✅ Stops current application (if running)
- ✅ Extracts deployment package
- ✅ Installs production dependencies
- ✅ Generates Prisma client
- ✅ Runs database migrations
- ✅ Configures Nginx reverse proxy
- ✅ Checks SSL certificate
- ✅ Starts application with PM2
- ✅ Verifies deployment

**Expected output:**
```
╔════════════════════════════════════════════════════════════════╗
║        Accounting API - Production Deployment                  ║
║        Target: mittonvillage.com                                    ║
║        Time: 2025-09-29 22:00:00                               ║
╚════════════════════════════════════════════════════════════════╝

[1/15] Running pre-deployment checks...
✓ Server connection successful
✓ PostgreSQL is running
✓ Nginx is running
✓ Sufficient disk space available

[2/15] Creating backup of current deployment...
✓ Backup created at /var/backups/accounting-api/20250929_220000

...

╔════════════════════════════════════════════════════════════════╗
║              Deployment Complete!                              ║
╚════════════════════════════════════════════════════════════════╝

Deployment Summary:
  • Timestamp:     20250929_220000
  • Server:        mittonvillage.com
  • Domain:        api.lifestreamdynamics.com
  • Port:          3100
  • Deploy Path:   /var/www/accounting-api
  • Backup:        /var/backups/accounting-api/20250929_220000

URLs:
  • API:           https://api.lifestreamdynamics.com
  • API Docs:      https://api.lifestreamdynamics.com/api-docs
  • Health Check:  https://api.lifestreamdynamics.com/health
```

**Duration:** ~3-5 minutes

---

### Step 3: Setup SSL Certificate (One-Time)

If SSL certificate doesn't exist, obtain one using Certbot:

```bash
ssh root@mittonvillage.com "certbot --nginx -d api.lifestreamdynamics.com"
```

Follow the interactive prompts:
1. Enter email address
2. Agree to Terms of Service
3. Choose whether to redirect HTTP to HTTPS (recommended: Yes)

**Certbot will:**
- Obtain SSL certificate from Let's Encrypt
- Automatically configure Nginx
- Set up auto-renewal

---

## 🔍 Post-Deployment Verification

### 1. Check Application Status

```bash
# View PM2 status
ssh root@mittonvillage.com "pm2 status"

# View application logs
ssh root@mittonvillage.com "pm2 logs accounting-api --lines 50"

# Monitor real-time
ssh root@mittonvillage.com "pm2 monit"
```

### 2. Test API Endpoints

```bash
# Health check
curl https://api.lifestreamdynamics.com/health

# Expected response:
# {"status":"ok","timestamp":"2025-09-29T22:00:00.000Z"}

# API version check
curl https://api.lifestreamdynamics.com/api/v1/health

# Test authentication endpoint
curl -X POST https://api.lifestreamdynamics.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

### 3. Verify Database Connection

```bash
ssh root@mittonvillage.com "cd /var/www/accounting-api && npx prisma db execute --stdin <<< 'SELECT NOW();'"
```

### 4. Check Nginx Configuration

```bash
ssh root@mittonvillage.com "nginx -t && systemctl status nginx"
```

---

## 🔄 Updating the Application

To deploy updates, simply run the deploy script again:

```bash
./scripts/deploy-production.sh
```

The script will:
- Back up the current version
- Deploy new code
- Run migrations
- Restart the application with zero downtime

---

## 📊 Monitoring & Maintenance

### View Logs

```bash
# Application logs
ssh root@mittonvillage.com "tail -f /var/www/accounting-api/logs/production.log"

# Error logs
ssh root@mittonvillage.com "tail -f /var/www/accounting-api/logs/error.log"

# PM2 logs
ssh root@mittonvillage.com "pm2 logs accounting-api"

# Nginx access logs
ssh root@mittonvillage.com "tail -f /var/log/nginx/accounting-api-access.log"

# Nginx error logs
ssh root@mittonvillage.com "tail -f /var/log/nginx/accounting-api-error.log"
```

### Restart Application

```bash
# Graceful restart
ssh root@mittonvillage.com "pm2 restart accounting-api"

# Restart with zero downtime
ssh root@mittonvillage.com "pm2 reload accounting-api"

# Stop application
ssh root@mittonvillage.com "pm2 stop accounting-api"

# Start application
ssh root@mittonvillage.com "pm2 start accounting-api"
```

### Database Maintenance

```bash
# Connect to database
ssh root@mittonvillage.com "sudo -u postgres psql accounting_api_production"

# Backup database
ssh root@mittonvillage.com "sudo -u postgres pg_dump accounting_api_production > backup_$(date +%Y%m%d).sql"

# Check database size
ssh root@mittonvillage.com "sudo -u postgres psql -c \"SELECT pg_size_pretty(pg_database_size('accounting_api_production'));\""
```

### System Resources

```bash
# Check disk space
ssh root@mittonvillage.com "df -h"

# Check memory usage
ssh root@mittonvillage.com "free -h"

# Check CPU usage
ssh root@mittonvillage.com "top -b -n 1 | head -20"

# PM2 resource monitoring
ssh root@mittonvillage.com "pm2 monit"
```

---

## 🔒 Security Checklist

- [ ] `.env.production` contains secure passwords and secrets
- [ ] `.env.production` has restrictive permissions (600)
- [ ] SSL certificate is installed and valid
- [ ] Database password is strong and unique
- [ ] JWT secrets are random and secure
- [ ] Encryption keys are properly generated
- [ ] Firewall rules are configured (if applicable)
- [ ] Rate limiting is enabled in Nginx
- [ ] CORS origins are properly configured
- [ ] Security headers are set in Nginx

---

## 🆘 Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
ssh root@mittonvillage.com "pm2 logs accounting-api --err --lines 100"

# Check if port is in use
ssh root@mittonvillage.com "lsof -i :3100"

# Verify environment variables
ssh root@mittonvillage.com "cd /var/www/accounting-api && cat .env | grep -v PASSWORD"
```

### Database Connection Issues

```bash
# Check PostgreSQL status
ssh root@mittonvillage.com "systemctl status postgresql"

# Test database connection
ssh root@mittonvillage.com "sudo -u postgres psql -c 'SELECT version();'"

# Check database exists
ssh root@mittonvillage.com "sudo -u postgres psql -l | grep accounting_api"
```

### Nginx Issues

```bash
# Test configuration
ssh root@mittonvillage.com "nginx -t"

# Reload configuration
ssh root@mittonvillage.com "systemctl reload nginx"

# Check if listening on port 80/443
ssh root@mittonvillage.com "netstat -tlnp | grep nginx"
```

### Out of Memory

```bash
# Check memory usage
ssh root@mittonvillage.com "free -h && pm2 list"

# Restart application
ssh root@mittonvillage.com "pm2 restart accounting-api"

# Reduce PM2 instances if needed (edit ecosystem.config.js)
```

---

## 🔙 Rollback Procedure

If deployment fails or causes issues:

```bash
# List available backups
ssh root@mittonvillage.com "ls -lht /var/backups/accounting-api/"

# Restore from backup
BACKUP_DATE="20250929_220000"  # Replace with actual backup timestamp
ssh root@mittonvillage.com << EOF
    pm2 stop accounting-api
    rm -rf /var/www/accounting-api/*
    rsync -a /var/backups/accounting-api/${BACKUP_DATE}/ /var/www/accounting-api/
    cd /var/www/accounting-api
    npm ci --production
    pm2 restart accounting-api
EOF
```

---

## 📞 Support

**Server Access:** root@mittonvillage.com
**Application Path:** /var/www/accounting-api
**Logs:** /var/www/accounting-api/logs/
**Backups:** /var/backups/accounting-api/

---

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] Update `.env.production` with secure values
- [ ] Verify SSH access to server
- [ ] Run local tests (`npm test`)
- [ ] Review recent changes
- [ ] Create git tag for release

### Deployment
- [ ] Run `./scripts/install-production.sh` (first time only)
- [ ] Run `./scripts/deploy-production.sh`
- [ ] Verify deployment completes successfully
- [ ] Check application status

### Post-Deployment
- [ ] Test health check endpoint
- [ ] Test API authentication
- [ ] Verify database connectivity
- [ ] Check application logs for errors
- [ ] Monitor resource usage
- [ ] Test critical API endpoints
- [ ] Verify SSL certificate

### SSL Setup (First Time)
- [ ] Run Certbot to obtain certificate
- [ ] Verify HTTPS access
- [ ] Test HTTP → HTTPS redirect
- [ ] Check certificate expiration date

---

**Deployment Status:** Ready for Production ✅