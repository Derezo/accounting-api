# 🚀 Quick Deployment Reference
## Lifestream Dynamics Accounting API

---

## 📍 Production URLs

- **API Base:** `https://api.lifestreamdynamics.com`
- **API Docs:** `https://api.lifestreamdynamics.com/api-docs`
- **Health Check:** `https://api.lifestreamdynamics.com/health`

---

## ⚡ Quick Commands

### First-Time Deployment

```bash
# 1. Update secrets in .env.production
openssl rand -hex 32  # Generate secrets

# 2. Install requirements (one-time)
./scripts/install-production.sh

# 3. Deploy application
./scripts/deploy-production.sh

# 4. Setup SSL
ssh root@mittonvillage.com "certbot --nginx -d api.lifestreamdynamics.com"
```

### Update Deployment

```bash
./scripts/deploy-production.sh
```

---

## 🔧 Common Tasks

### View Logs
```bash
ssh root@mittonvillage.com "pm2 logs accounting-api --lines 100"
```

### Restart App
```bash
ssh root@mittonvillage.com "pm2 restart accounting-api"
```

### Check Status
```bash
ssh root@mittonvillage.com "pm2 status"
```

### Test Health
```bash
curl https://api.lifestreamdynamics.com/health
```

### Database Backup
```bash
ssh root@mittonvillage.com "sudo -u postgres pg_dump accounting_api_production > backup_$(date +%Y%m%d).sql"
```

---

## 🔨 Recent Fixes (2025-09-30)

### Deploy Script Hanging Fix
**Issue:** Script hung at "Installing production dependencies"
- Added 10-minute timeout to npm install
- Added CI environment variables to prevent interactive prompts
- Increased output visibility (tail -20 instead of /dev/null)

### Nginx SSL Configuration Fix
**Issue:** Nginx failed with "no ssl_certificate is defined"
- Changed initial config to HTTP-only (port 80)
- Certbot now runs automatically during deployment
- SSL configuration added by Certbot after certificate obtained

### PM2 Entry Point Fix
**Issue:** Wrong entry point in ecosystem.config.js
- Updated to correct path: `./dist/src/index.js`
- Changed to cluster mode for better performance
- Added env_file support for environment variables

---

## 📊 Server Details

- **Host:** mittonvillage.com
- **Port:** 3100 (internal)
- **Path:** /var/www/accounting-api
- **User:** accounting-api
- **Database:** accounting_api_production
- **Process Manager:** PM2

---

## ⚠️ Before Deploying

- [ ] Update all `CHANGE_THIS_*` values in `.env.production`
- [ ] Generate secure secrets with `openssl rand -hex 32`
- [ ] Set file permissions: `chmod 600 .env.production`
- [ ] Ensure DNS points to mittonvillage.com
- [ ] Have database password ready

---

## 🆘 Quick Troubleshooting

**App won't start:**
```bash
ssh root@mittonvillage.com "pm2 logs accounting-api --err --lines 50"
```

**Database issues:**
```bash
ssh root@mittonvillage.com "systemctl status postgresql"
```

**Nginx issues:**
```bash
ssh root@mittonvillage.com "nginx -t && systemctl status nginx"
```

**Rollback:**
```bash
ssh root@mittonvillage.com "ls -lt /var/backups/accounting-api/"
# Note the timestamp, then restore from backup
```

---

## 📞 Quick Access

**SSH:** `ssh root@mittonvillage.com`
**App Path:** `cd /var/www/accounting-api`
**Logs:** `cd /var/www/accounting-api/logs`

---

For detailed documentation, see **DEPLOYMENT.md**