# Docker Quick Start Guide

## 🚀 Development Setup (5 minutes)

### Prerequisites
- Docker & Docker Compose installed
- Node.js 18+ installed
- Git installed

### Automated Setup
```bash
# Clone repository
git clone <your-repo-url>
cd accounting-api

# Run automated development setup
./scripts/dev-setup.sh

# That's it! API will be running at http://localhost:3000
```

### Manual Setup
```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env

# 3. Start Docker services
docker-compose up -d

# 4. Setup database
npx prisma migrate dev
npx prisma generate

# 5. Start development server
npm run dev
```

## 🔧 Common Commands

### Docker Management
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Check service status
docker-compose ps

# Restart specific service
docker-compose restart api

# Rebuild and restart
docker-compose up -d --build
```

### Database Operations
```bash
# Reset database
./scripts/reset-db.sh

# Open Prisma Studio
npx prisma studio

# Run migrations
npx prisma migrate dev

# Seed database
npm run prisma:seed
```

### Testing
```bash
# Test API endpoints
./scripts/test-api.sh

# Run security tests
node security-tests/security-test-suite.js

# Run penetration tests
./security-tests/penetration-tests.sh
```

## 📊 Service URLs

| Service | Development URL | Production URL |
|---------|----------------|----------------|
| API | http://localhost:3000 | https://your-domain.com |
| Database | localhost:5432 | Internal only |
| Redis | localhost:6379 | Internal only |
| Nginx | http://localhost:80 | https://your-domain.com |
| Kibana | N/A | http://localhost:5601 |
| Grafana | N/A | http://localhost:3001 |

## 🔐 Production Deployment

### Quick Production Setup
```bash
# Run automated production setup
sudo ./scripts/setup-production.sh your-domain.com admin@your-domain.com

# Manual production deployment
docker-compose -f docker-compose.production.yml up -d
```

### Production Services
- **Load Balancer**: Nginx with SSL termination
- **API**: Multiple instances for high availability
- **Database**: PostgreSQL primary + read replica
- **Cache**: Redis cluster
- **Monitoring**: ELK stack + Prometheus/Grafana

## 🛠️ Troubleshooting

### Common Issues

#### API not responding
```bash
# Check API health
curl http://localhost:3000/health

# View API logs
docker-compose logs api

# Restart API
docker-compose restart api
```

#### Database connection error
```bash
# Check database status
docker-compose exec postgres pg_isready

# View database logs
docker-compose logs postgres

# Reset database
docker-compose down
docker volume rm accounting-api_postgres_data
docker-compose up -d
```

#### Port conflicts
```bash
# Check what's using port 3000
lsof -i :3000

# Use different port
PORT=3001 docker-compose up -d
```

#### Memory issues
```bash
# Check Docker resource usage
docker stats

# Clean up unused containers/images
docker system prune -f

# Increase Docker memory limit in Docker Desktop
```

### Logs and Debugging
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f nginx

# Follow logs in real-time
docker-compose logs -f --tail=100 api

# Save logs to file
docker-compose logs > debug.log
```

## 🔍 Health Checks

### API Health Check
```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### Database Health Check
```bash
curl http://localhost:3000/health/db
# Expected: {"status":"healthy","database":"connected"}
```

### Service Status Check
```bash
docker-compose ps
# All services should show "Up" status
```

## 📋 Environment Variables

### Required for Development
```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres_password@localhost:5432/accounting_db
REDIS_URL=redis://:redis_password@localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production
```

### Required for Production
```bash
NODE_ENV=production
DATABASE_URL=postgresql://postgres:secure_password@postgres-primary:5432/accounting_db
REDIS_URL=redis://:secure_password@redis-master:6379
JWT_SECRET=secure-jwt-secret-from-docker-secrets
STRIPE_SECRET_KEY=sk_live_actual_stripe_key
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
```

## 🧪 Testing Checklist

### Development Testing
- [ ] API health check passes
- [ ] Database connection works
- [ ] Authentication endpoints work
- [ ] CRUD operations function
- [ ] Security tests pass

### Production Testing
- [ ] SSL certificate valid
- [ ] All security headers present
- [ ] Rate limiting active
- [ ] Monitoring systems operational
- [ ] Backup systems functional

## 🆘 Getting Help

### Check These First
1. **API Health**: `curl http://localhost:3000/health`
2. **Service Status**: `docker-compose ps`
3. **Logs**: `docker-compose logs -f`
4. **Environment**: Check `.env` file exists and is configured

### Common Solutions
- **Connection refused**: Service not started → `docker-compose up -d`
- **Port in use**: Kill process or change port → `lsof -i :3000`
- **Database error**: Reset database → `./scripts/reset-db.sh`
- **Permission denied**: Check file permissions → `chmod +x scripts/*.sh`

### Support Resources
- 📖 **Full Documentation**: `README-DEPLOYMENT.md`
- 🔐 **Security Guide**: `SECURITY-ANALYSIS.md`
- 🧪 **Security Tests**: `security-tests/`
- ⚙️ **Configuration**: `docker/` directory

---

**Quick Commands Reference**:
```bash
# Start everything
./scripts/dev-setup.sh

# Test API
curl http://localhost:3000/health

# View logs
docker-compose logs -f

# Reset if broken
docker-compose down && docker-compose up -d
```