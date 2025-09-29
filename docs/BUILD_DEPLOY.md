# Build and Deployment Guide

## Overview

This guide covers the complete build and deployment process for the Accounting API across different environments: development, staging, and production.

## Table of Contents
- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Build Process](#build-process)
- [Docker Deployment](#docker-deployment)
- [Environment Configurations](#environment-configurations)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Local Development
```bash
# Install dependencies
npm install

# Set up environment
cp .env.development .env

# Start development server
npm run dev

# Or with Docker
docker-compose up -d
```

### Production Build
```bash
# Clean and build for production
npm run build

# Start production server
npm run start:prod

# Or deploy with Docker
npm run deploy:prod
```

## Environment Setup

### Prerequisites
- Node.js ≥ 18.0.0
- Docker & Docker Compose
- PostgreSQL (if running locally)
- Redis (if running locally)

### Environment Files
Create appropriate environment files based on your deployment target:

| Environment | File | Source Template |
|-------------|------|-----------------|
| Development | `.env` | `.env.development` |
| Staging | `.env.staging` | `.env.staging` |
| Production | `.env.production` | `.env.production.template` |

## Build Process

### Build Scripts
| Script | Purpose | Environment |
|--------|---------|-------------|
| `npm run build` | Full production build with validation | Production |
| `npm run build:dev` | Development build with linting | Development |
| `npm run build:staging` | Staging build with debug info | Staging |
| `npm run build:prod` | Optimized production build | Production |

### Build Stages
1. **Clean**: Remove previous build artifacts
2. **Lint**: ESLint validation with TypeScript rules
3. **Type Check**: TypeScript compilation validation
4. **Compile**: TypeScript to JavaScript compilation
5. **Optimize**: Production optimizations (minification, etc.)

### TypeScript Configuration
- **Development**: `tsconfig.json` (includes tests)
- **Production**: `tsconfig.build.json` (excludes tests, dev files)

## Docker Deployment

### Multi-Stage Dockerfile
The Dockerfile supports multiple targets for different environments:

```dockerfile
# Development target
docker build --target development -t accounting-api:dev .

# Staging target
docker build --target staging -t accounting-api:staging .

# Production target
docker build --target production -t accounting-api:prod .
```

### Docker Compose Configurations

#### Development
```bash
# Start development environment
docker-compose up -d

# View logs
docker-compose logs -f api

# Rebuild and restart
docker-compose up -d --build
```

#### Staging
```bash
# Deploy to staging
docker-compose -f docker-compose.staging.yml up -d

# Monitor staging deployment
docker-compose -f docker-compose.staging.yml logs -f
```

#### Production
```bash
# Deploy to production
docker-compose -f docker-compose.production.yml up -d

# Health check
curl http://localhost:3000/health
```

### Container Architecture

#### Development Container
- **Base**: Node.js 18 Alpine
- **Features**: Hot reload, debug port (9229), volume mounting
- **Database**: PostgreSQL (localhost:5432)
- **Cache**: Redis (localhost:6379)

#### Staging Container
- **Base**: Node.js 18 Alpine
- **Features**: Built code, staging database, monitoring
- **Database**: PostgreSQL (localhost:5433)
- **Cache**: Redis (localhost:6380)

#### Production Container
- **Base**: Node.js 18 Alpine
- **Features**: Optimized build, security hardening, health checks
- **Database**: PostgreSQL with read replicas
- **Cache**: Redis with persistence

## Environment Configurations

### Development Environment
- **Purpose**: Local development and testing
- **Features**: Hot reload, debug logging, test data
- **Database**: Local PostgreSQL or Docker
- **External Services**: Mock/sandbox APIs

### Staging Environment
- **Purpose**: Pre-production testing and QA
- **Features**: Production-like setup with debug capabilities
- **Database**: Isolated staging database
- **External Services**: Test/sandbox APIs

### Production Environment
- **Purpose**: Live application serving real users
- **Features**: High availability, monitoring, security
- **Database**: Primary + read replicas, backup strategy
- **External Services**: Production APIs with proper credentials

## Application Startup Sequence

### Development Startup
1. Load environment variables from `.env`
2. Initialize database connection (SQLite or PostgreSQL)
3. Run database migrations if needed
4. Start Express server with hot reload
5. Initialize Swagger documentation
6. Enable debug logging

### Production Startup
1. Load environment variables from system/Docker secrets
2. Initialize database connection with connection pooling
3. Run health checks for external dependencies
4. Start Express server with production optimizations
5. Initialize monitoring and metrics collection
6. Set up graceful shutdown handlers

## Database Management

### Migrations
```bash
# Development
npm run prisma:migrate

# Production (run before deployment)
npx prisma migrate deploy
```

### Seeding
```bash
# Development (with test data)
npm run prisma:seed

# Production (reference data only)
NODE_ENV=production npm run prisma:seed
```

## Monitoring and Health Checks

### Health Endpoints
- **Application**: `GET /health`
- **Database**: `GET /health/db`
- **Detailed**: `GET /api/v1/health`

### Docker Health Checks
All containers include health checks with appropriate timeouts:
- **Development**: 30s interval, 40s start period
- **Staging**: 20s interval, 30s start period
- **Production**: 30s interval, 60s start period

## CI/CD Pipeline

### Automated Build Process
```yaml
# Example GitHub Actions workflow
name: Build and Deploy
on:
  push:
    branches: [main, staging, develop]

jobs:
  build:
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run validate:prod
      - run: npm run build:prod

  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    needs: build
    steps:
      - run: npm run deploy:staging

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: build
    steps:
      - run: npm run deploy:prod
```

### Deployment Commands
```bash
# Quick deployment scripts
npm run deploy:staging    # Deploy to staging environment
npm run deploy:prod       # Deploy to production environment
```

## Security Considerations

### Development Security
- Use development secrets (clearly marked as non-production)
- Enable CORS for local frontend development
- Use HTTP for local development

### Production Security
- Use proper secret management (AWS Secrets Manager, HashiCorp Vault, etc.)
- Enable HTTPS/TLS encryption
- Implement proper CORS policies
- Use security headers (HSTS, CSP, etc.)
- Enable audit logging

## Performance Optimization

### Build Optimization
- TypeScript compilation with production settings
- Tree shaking for unused code elimination
- Source map generation for debugging
- Asset optimization and compression

### Runtime Optimization
- Connection pooling for database
- Redis caching for sessions and data
- Rate limiting to prevent abuse
- Graceful shutdown handling

## Troubleshooting

### Common Build Issues

#### TypeScript Errors
```bash
# Check for type errors
npm run typecheck

# Fix linting issues
npm run lint:fix
```

#### Dependency Issues
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

#### Docker Build Issues
```bash
# Clean Docker cache
docker system prune -f

# Rebuild with no cache
docker-compose build --no-cache
```

### Common Runtime Issues

#### Database Connection
```bash
# Check database status
docker-compose ps postgres

# View database logs
docker-compose logs postgres
```

#### Application Startup
```bash
# Check application logs
docker-compose logs api

# Check health endpoints
curl http://localhost:3000/health
```

#### Performance Issues
```bash
# Monitor container resources
docker stats

# Check application metrics
curl http://localhost:3000/api/v1/health
```

## Best Practices

### Development
1. Always use environment files for configuration
2. Run validation before committing code
3. Use Docker for consistent development environment
4. Test with production-like data when possible

### Deployment
1. Always run builds through CI/CD pipeline
2. Test deployments in staging before production
3. Monitor health checks after deployment
4. Have rollback plan ready
5. Use blue-green or canary deployments for zero downtime

### Security
1. Never commit secrets to version control
2. Use different secrets for each environment
3. Rotate secrets regularly
4. Monitor for security vulnerabilities
5. Keep dependencies updated

## Support and Maintenance

### Logs Location
- **Development**: `./logs/`
- **Docker**: Use `docker-compose logs`
- **Production**: Centralized logging system

### Backup Strategy
- **Database**: Automated daily backups
- **Configuration**: Version controlled
- **Secrets**: Secure backup of encryption keys

### Updates and Patches
1. Test updates in development environment
2. Deploy to staging for validation
3. Schedule maintenance window for production
4. Monitor for issues post-deployment

For additional support, refer to the [Error Handling Guide](./ERROR_HANDLING.md) and [API Documentation](./API_REFERENCE.md).