# API Documentation Deployment Guide

This guide covers deploying the Accounting API documentation for different environments and use cases.

## Quick Start

### 1. Development Environment

```bash
# Start API with integrated documentation
npm run dev

# Access documentation at:
# http://localhost:3000/api-docs (Swagger UI)
# http://localhost:3000/api-docs/openapi.json (OpenAPI spec)
```

### 2. Standalone Documentation Server

```bash
# Build and run documentation container
docker-compose up -d docs

# Access documentation at:
# http://localhost:8080 (Static documentation)
```

### 3. Generate All Documentation

```bash
# Generate TypeScript types, HTML docs, and validate spec
npm run docs:generate

# Generate specific components
npm run docs:types        # TypeScript types only
npm run docs:build        # HTML documentation only
npm run docs:serve        # Serve with live reload
```

## Deployment Options

### Option 1: Integrated with API Server

The simplest deployment is to serve documentation alongside the API server.

**Pros:**
- Always in sync with API
- Single deployment
- Easy to maintain

**Cons:**
- Couples documentation with API
- Higher resource usage
- API downtime affects docs

**Setup:**
```typescript
// Already configured in src/app.ts
import { setupSwagger } from './config/swagger.config';
setupSwagger(app);
```

### Option 2: Standalone Documentation Server

Deploy documentation as a separate service for better separation of concerns.

**Pros:**
- Independent from API
- Better performance
- Can serve multiple API versions
- Easy to scale

**Cons:**
- Requires separate deployment
- May get out of sync

**Docker Setup:**
```bash
# Build documentation image
docker build -f docker/docs.Dockerfile -t accounting-docs .

# Run container
docker run -d -p 8080:80 --name docs accounting-docs

# Or use Docker Compose
docker-compose up -d docs
```

### Option 3: Static Site Hosting

Generate static HTML and deploy to CDN or static hosting.

**Pros:**
- Fastest loading
- CDN distribution
- Lowest cost
- High availability

**Cons:**
- Manual updates required
- No interactive features
- Version management complexity

**Setup:**
```bash
# Generate static documentation
npm run docs:build

# Deploy docs/api-docs.html to your static host
# Examples: Netlify, Vercel, AWS S3, GitHub Pages
```

### Option 4: Documentation Platform

Use dedicated documentation platforms for enterprise features.

**Platforms:**
- GitBook
- Confluence
- Notion
- ReadMe
- Stoplight

**Setup:**
```bash
# Export OpenAPI spec
npm run docs:generate

# Import docs/openapi.yaml to your platform
```

## Environment-Specific Configurations

### Development

```yaml
# docker-compose.yml
services:
  docs:
    build:
      context: .
      dockerfile: docker/docs.Dockerfile
      target: development
    environment:
      - NODE_ENV=development
    volumes:
      - ./docs:/app/docs:ro
      - ./src:/app/src:ro
    ports:
      - "8080:80"
```

### Staging

```yaml
# docker-compose.staging.yml
services:
  docs:
    build:
      context: .
      dockerfile: docker/docs.Dockerfile
      target: production
    environment:
      - NODE_ENV=staging
      - API_BASE_URL=https://staging-api.accounting.com
    ports:
      - "8080:80"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.docs-staging.rule=Host(`docs-staging.accounting.com`)"
```

### Production

```yaml
# docker-compose.production.yml
services:
  docs:
    image: accounting-docs:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - API_BASE_URL=https://api.accounting.com
    networks:
      - accounting-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.docs.rule=Host(`docs.accounting.com`)"
      - "traefik.http.routers.docs.tls=true"
      - "traefik.http.routers.docs.tls.certresolver=letsencrypt"
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/docs.yml
name: Documentation

on:
  push:
    branches: [main, develop]
    paths: ['docs/**', 'src/**/*.ts']

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate documentation
        run: npm run docs:generate

      - name: Validate OpenAPI spec
        run: npm run docs:generate -- --no-types --no-html --verbose

      - name: Build documentation container
        run: docker build -f docker/docs.Dockerfile -t accounting-docs:${{ github.sha }} .

      - name: Deploy to staging
        if: github.ref == 'refs/heads/develop'
        run: |
          docker tag accounting-docs:${{ github.sha }} accounting-docs:staging
          # Deploy to staging environment

      - name: Deploy to production
        if: github.ref == 'refs/heads/main'
        run: |
          docker tag accounting-docs:${{ github.sha }} accounting-docs:latest
          # Deploy to production environment
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE/docs

docs:build:
  stage: build
  script:
    - npm ci
    - npm run docs:generate
    - docker build -f docker/docs.Dockerfile -t $DOCKER_IMAGE:$CI_COMMIT_SHA .
    - docker push $DOCKER_IMAGE:$CI_COMMIT_SHA

docs:test:
  stage: test
  script:
    - npm run docs:generate -- --verbose
    - docker run --rm $DOCKER_IMAGE:$CI_COMMIT_SHA curl -f http://localhost/health

docs:deploy:staging:
  stage: deploy
  script:
    - docker tag $DOCKER_IMAGE:$CI_COMMIT_SHA $DOCKER_IMAGE:staging
    - docker push $DOCKER_IMAGE:staging
    # Deploy to staging
  only:
    - develop

docs:deploy:production:
  stage: deploy
  script:
    - docker tag $DOCKER_IMAGE:$CI_COMMIT_SHA $DOCKER_IMAGE:latest
    - docker push $DOCKER_IMAGE:latest
    # Deploy to production
  only:
    - main
```

## Performance Optimization

### Nginx Configuration

```nginx
# docker/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;

    # Enable compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # Cache static assets
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Health check
    location /health {
        access_log off;
        return 200 '{"status":"healthy"}';
        add_header Content-Type application/json;
    }
}
```

### CDN Integration

```bash
# Example: AWS CloudFront
aws cloudfront create-distribution \
  --distribution-config '{
    "CallerReference": "accounting-docs-'$(date +%s)'",
    "Origins": {
      "Quantity": 1,
      "Items": [{
        "Id": "docs-origin",
        "DomainName": "docs.accounting.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only"
        }
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "docs-origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "MinTTL": 0,
      "DefaultTTL": 86400,
      "MaxTTL": 31536000
    },
    "Comment": "Accounting API Documentation",
    "Enabled": true
  }'
```

## Monitoring and Alerting

### Health Checks

```bash
# Basic health check
curl -f http://localhost:8080/health

# Comprehensive check
curl -f http://localhost:8080/api-docs/openapi.json | jq .info.version
```

### Prometheus Metrics

```yaml
# docker-compose.monitoring.yml
services:
  docs:
    # ... existing config
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=80"
      - "prometheus.path=/metrics"

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
```

### Alerting Rules

```yaml
# monitoring/alerts.yml
groups:
  - name: docs
    rules:
      - alert: DocumentationDown
        expr: up{job="docs"} == 0
        for: 1m
        annotations:
          summary: "Documentation service is down"

      - alert: DocumentationHighErrorRate
        expr: rate(nginx_http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        annotations:
          summary: "High error rate in documentation service"
```

## Maintenance

### Regular Tasks

```bash
# Update documentation
npm run docs:generate

# Validate OpenAPI spec
npm run docs:generate -- --no-types --no-html --verbose

# Check for broken links
npm run docs:validate-links

# Update dependencies
npm audit fix
npm update
```

### Version Management

```bash
# Tag documentation version
git tag -a "docs-v1.0.0" -m "Documentation version 1.0.0"

# Build versioned container
docker build -f docker/docs.Dockerfile -t accounting-docs:v1.0.0 .

# Deploy specific version
docker run -d -p 8080:80 accounting-docs:v1.0.0
```

### Backup and Recovery

```bash
# Backup documentation
tar -czf docs-backup-$(date +%Y%m%d).tar.gz docs/

# Backup generated files
cp -r docs/ backup/docs-$(date +%Y%m%d)/

# Recovery
tar -xzf docs-backup-20231201.tar.gz
npm run docs:generate
```

## Troubleshooting

### Common Issues

1. **OpenAPI validation fails**
   ```bash
   npm run docs:generate -- --verbose
   # Check error output for specific issues
   ```

2. **TypeScript types generation fails**
   ```bash
   npm run docs:types
   # Ensure OpenAPI spec is valid
   ```

3. **Container build fails**
   ```bash
   docker build -f docker/docs.Dockerfile --no-cache -t test .
   ```

4. **Documentation not updating**
   ```bash
   # Clear generated files
   rm -rf docs/api-docs.html docs/examples/
   npm run docs:generate
   ```

### Debug Mode

```bash
# Enable verbose logging
export DEBUG=docs:*
npm run docs:generate -- --verbose

# Check container logs
docker logs accounting-docs

# Test documentation server
curl -v http://localhost:8080/health
```

## Security Considerations

### Access Control

```nginx
# Restrict access to internal docs
location /internal {
    deny all;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=docs:10m rate=10r/s;
limit_req zone=docs burst=20 nodelay;
```

### HTTPS Configuration

```yaml
# docker-compose.production.yml
services:
  docs:
    labels:
      - "traefik.http.routers.docs.tls=true"
      - "traefik.http.routers.docs.tls.certresolver=letsencrypt"
      - "traefik.http.middlewares.docs-redirect.redirectscheme.scheme=https"
```

---

## Support

For deployment issues or questions:
- **Documentation Issues**: Create GitHub issue with `documentation` label
- **Infrastructure Support**: Contact DevOps team
- **Emergency**: Use on-call escalation

## Next Steps

1. Choose deployment strategy based on requirements
2. Set up CI/CD pipeline for automated deployments
3. Configure monitoring and alerting
4. Establish maintenance procedures
5. Train team on documentation updates