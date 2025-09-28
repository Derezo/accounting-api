# 🚀 Production Deployment Guide

> **Comprehensive guide for deploying the Enterprise Accounting API to production environments with enterprise-grade reliability, security, and scalability.**

## 📋 Table of Contents

- [Deployment Overview](#deployment-overview)
- [Infrastructure Requirements](#infrastructure-requirements)
- [Docker Deployment Strategies](#docker-deployment-strategies)
- [Environment Configuration](#environment-configuration)
- [Security Hardening](#security-hardening)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Performance Optimization](#performance-optimization)
- [Scaling Considerations](#scaling-considerations)
- [Health Checks & Maintenance](#health-checks--maintenance)

---

## 🏗️ Deployment Overview

### Deployment Architecture

```typescript
interface ProductionArchitecture {
  // Load Balancer Tier
  loadBalancer: {
    technology: 'Nginx/HAProxy/AWS ALB';
    features: ['SSL termination', 'Rate limiting', 'Health checks'];
    configuration: 'High availability with failover';
  };

  // Application Tier
  application: {
    containers: 'Docker containers with Kubernetes/Docker Swarm';
    instances: 'Multiple instances for high availability';
    scaling: 'Horizontal scaling based on metrics';
    deployment: 'Blue-green or rolling deployment';
  };

  // Database Tier
  database: {
    primary: 'PostgreSQL with read replicas';
    cache: 'Redis cluster for sessions and caching';
    backup: 'Automated backups with point-in-time recovery';
  };

  // Storage Tier
  storage: {
    files: 'S3-compatible object storage';
    logs: 'Centralized logging with ELK stack';
    metrics: 'Prometheus + Grafana monitoring';
  };

  // Security Tier
  security: {
    firewall: 'WAF and DDoS protection';
    certificates: 'Automated SSL certificate management';
    secrets: 'HashiCorp Vault or AWS Secrets Manager';
    monitoring: 'Security information and event management (SIEM)';
  };
}
```

### Deployment Environments

```yaml
# Environment hierarchy
environments:
  development:
    purpose: "Local development and feature testing"
    infrastructure: "Single container, SQLite database"
    domain: "localhost:3000"

  staging:
    purpose: "Integration testing and QA"
    infrastructure: "Production-like setup with PostgreSQL"
    domain: "staging-api.accounting.example.com"

  production:
    purpose: "Live customer-facing environment"
    infrastructure: "Full enterprise setup with clustering"
    domain: "api.accounting.example.com"

  disaster_recovery:
    purpose: "Backup production environment"
    infrastructure: "Mirror of production in different region"
    domain: "dr-api.accounting.example.com"
```

---

## 🖥️ Infrastructure Requirements

### Minimum System Requirements

```yaml
# Production server specifications
server_requirements:
  cpu:
    minimum: "4 cores (8 threads)"
    recommended: "8 cores (16 threads)"
    optimal: "16 cores (32 threads)"

  memory:
    minimum: "8 GB RAM"
    recommended: "16 GB RAM"
    optimal: "32 GB RAM"

  storage:
    application: "50 GB SSD"
    database: "500 GB SSD with 3000+ IOPS"
    logs: "100 GB (with rotation)"
    backup: "2TB+ for 30-day retention"

  network:
    bandwidth: "1 Gbps"
    latency: "<50ms to database"
    connections: "10,000+ concurrent connections"

# Database requirements
database_requirements:
  postgresql:
    version: "15+"
    memory: "25% of total system RAM"
    connections: "200 max connections"
    storage: "Fast SSD with automated scaling"

  redis:
    version: "7+"
    memory: "2-4 GB for session storage"
    persistence: "RDB + AOF for durability"
    clustering: "3-node cluster for HA"
```

### Cloud Provider Recommendations

```typescript
// AWS Infrastructure
interface AWSInfrastructure {
  compute: {
    application: 'ECS Fargate or EKS for containers';
    instances: 't3.large minimum, m5.xlarge recommended';
    autoScaling: 'Application Load Balancer with auto scaling groups';
  };

  database: {
    primary: 'RDS PostgreSQL with Multi-AZ deployment';
    cache: 'ElastiCache Redis cluster mode';
    backup: 'Automated backups with 30-day retention';
  };

  storage: {
    files: 'S3 with CloudFront CDN';
    secrets: 'AWS Secrets Manager';
    parameters: 'Systems Manager Parameter Store';
  };

  networking: {
    vpc: 'Multi-AZ VPC with private subnets';
    security: 'WAF, Security Groups, NACLs';
    loadBalancer: 'Application Load Balancer with SSL';
  };

  monitoring: {
    logs: 'CloudWatch Logs with log insights';
    metrics: 'CloudWatch + custom dashboards';
    alerts: 'SNS notifications for critical events';
  };
}

// Azure Infrastructure
interface AzureInfrastructure {
  compute: {
    application: 'Azure Container Instances or AKS';
    instances: 'Standard_D4s_v3 minimum';
    scaling: 'Azure Load Balancer with VM Scale Sets';
  };

  database: {
    primary: 'Azure Database for PostgreSQL';
    cache: 'Azure Cache for Redis';
    backup: 'Automated backup with geo-redundancy';
  };

  storage: {
    files: 'Azure Blob Storage with CDN';
    secrets: 'Azure Key Vault';
    configuration: 'Azure App Configuration';
  };
}

// Google Cloud Infrastructure
interface GCPInfrastructure {
  compute: {
    application: 'Cloud Run or GKE';
    instances: 'n1-standard-4 minimum';
    scaling: 'Cloud Load Balancing with auto scaling';
  };

  database: {
    primary: 'Cloud SQL for PostgreSQL';
    cache: 'Memorystore for Redis';
    backup: 'Automated backup with point-in-time recovery';
  };

  storage: {
    files: 'Cloud Storage with Cloud CDN';
    secrets: 'Secret Manager';
    configuration: 'Runtime Configurator';
  };
}
```

---

## 🐳 Docker Deployment Strategies

### Production Dockerfile

```dockerfile
# Multi-stage production Dockerfile
FROM node:18-alpine AS builder

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Build application
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy health check script
COPY scripts/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ./health-check.sh

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

### Docker Compose Production

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    image: accounting-api:production
    container_name: accounting-api
    restart: unless-stopped

    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}

    ports:
      - "3000:3000"

    depends_on:
      - postgres
      - redis

    volumes:
      - ./logs:/app/logs
      - /etc/localtime:/etc/localtime:ro

    networks:
      - app-network

    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G

    healthcheck:
      test: ["CMD", "./health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  postgres:
    image: postgres:15-alpine
    container_name: accounting-postgres
    restart: unless-stopped

    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256

    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
      - ./scripts/postgres-init.sh:/docker-entrypoint-initdb.d/init.sh

    ports:
      - "5432:5432"

    networks:
      - app-network

    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 8G
        reservations:
          cpus: '1.0'
          memory: 4G

  redis:
    image: redis:7-alpine
    container_name: accounting-redis
    restart: unless-stopped

    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes

    volumes:
      - redis_data:/data
      - ./config/redis.conf:/usr/local/etc/redis/redis.conf

    ports:
      - "6379:6379"

    networks:
      - app-network

    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G

  nginx:
    image: nginx:alpine
    container_name: accounting-nginx
    restart: unless-stopped

    ports:
      - "80:80"
      - "443:443"

    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
      - ./logs/nginx:/var/log/nginx

    depends_on:
      - api

    networks:
      - app-network

  prometheus:
    image: prom/prometheus:latest
    container_name: accounting-prometheus
    restart: unless-stopped

    ports:
      - "9090:9090"

    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

    networks:
      - app-network

  grafana:
    image: grafana/grafana:latest
    container_name: accounting-grafana
    restart: unless-stopped

    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}

    ports:
      - "3001:3000"

    volumes:
      - grafana_data:/var/lib/grafana
      - ./config/grafana:/etc/grafana/provisioning

    networks:
      - app-network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  prometheus_data:
    driver: local
  grafana_data:
    driver: local

networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Kubernetes Deployment

```yaml
# kubernetes/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: accounting-api
  labels:
    name: accounting-api

---
# kubernetes/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: accounting-api-config
  namespace: accounting-api
data:
  NODE_ENV: "production"
  PORT: "3000"
  API_VERSION: "v1"
  CORS_ORIGIN: "https://app.accounting.example.com"

---
# kubernetes/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: accounting-api-secrets
  namespace: accounting-api
type: Opaque
data:
  DATABASE_URL: <base64-encoded-database-url>
  JWT_SECRET: <base64-encoded-jwt-secret>
  ENCRYPTION_KEY: <base64-encoded-encryption-key>
  STRIPE_SECRET_KEY: <base64-encoded-stripe-key>

---
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: accounting-api
  namespace: accounting-api
  labels:
    app: accounting-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: accounting-api
  template:
    metadata:
      labels:
        app: accounting-api
    spec:
      containers:
      - name: api
        image: accounting-api:production
        ports:
        - containerPort: 3000
          name: http
        envFrom:
        - configMapRef:
            name: accounting-api-config
        - secretRef:
            name: accounting-api-secrets
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2000m
            memory: 4Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: tmp
        emptyDir: {}
      - name: logs
        emptyDir: {}

---
# kubernetes/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: accounting-api-service
  namespace: accounting-api
spec:
  selector:
    app: accounting-api
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP

---
# kubernetes/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: accounting-api-ingress
  namespace: accounting-api
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - api.accounting.example.com
    secretName: accounting-api-tls
  rules:
  - host: api.accounting.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: accounting-api-service
            port:
              number: 80

---
# kubernetes/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: accounting-api-hpa
  namespace: accounting-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: accounting-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## ⚙️ Environment Configuration

### Production Environment Variables

```bash
# .env.production
# ================

# Application Configuration
NODE_ENV=production
PORT=3000
API_VERSION=v1
LOG_LEVEL=info

# Database Configuration
DATABASE_URL="postgresql://username:password@host:5432/accounting_prod?sslmode=require"
DATABASE_POOL_SIZE=20
DATABASE_TIMEOUT=30000

# Redis Configuration
REDIS_URL="redis://username:password@host:6379/0"
REDIS_POOL_SIZE=10
SESSION_TTL=86400

# Security Configuration
JWT_SECRET="your-super-secure-256-bit-secret-key"
JWT_EXPIRY=900
REFRESH_TOKEN_EXPIRY=604800
ENCRYPTION_KEY="your-32-character-encryption-key-12"
BCRYPT_ROUNDS=12

# External Services
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_CONNECT_CLIENT_ID="ca_..."

# Email Configuration
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT=587
SMTP_USER="apikey"
SMTP_PASSWORD="SG.your-sendgrid-api-key"
EMAIL_FROM="noreply@accounting.example.com"

# File Storage
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_REGION="us-east-1"
S3_BUCKET="accounting-api-documents"
S3_REGION="us-east-1"

# Monitoring & Logging
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
ENABLE_SQL_LOGGING=false
SENTRY_DSN="https://your-sentry-dsn@sentry.io/project"
NEW_RELIC_LICENSE_KEY="your-newrelic-key"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false

# CORS Configuration
CORS_ORIGIN="https://app.accounting.example.com,https://admin.accounting.example.com"
CORS_CREDENTIALS=true

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000
HEALTH_CHECK_INTERVAL=30000

# Feature Flags
ENABLE_METRICS=true
ENABLE_RATE_LIMITING=true
ENABLE_REQUEST_ID=true
ENABLE_COMPRESSION=true

# Compliance
AUDIT_LOG_RETENTION_DAYS=2555  # 7 years
GDPR_COMPLIANCE=true
FINTRAC_COMPLIANCE=true
```

### Environment-Specific Configurations

```typescript
// config/environments.ts
interface EnvironmentConfig {
  development: {
    database: {
      url: 'file:./dev.db';
      logging: true;
      synchronize: true;
    };
    cache: {
      type: 'memory';
      ttl: 300;
    };
    security: {
      cors: { origin: '*' };
      rateLimit: { max: 1000 };
    };
  };

  staging: {
    database: {
      url: process.env.DATABASE_URL;
      logging: false;
      ssl: true;
      poolSize: 10;
    };
    cache: {
      type: 'redis';
      url: process.env.REDIS_URL;
      ttl: 3600;
    };
    security: {
      cors: { origin: ['https://staging-app.accounting.example.com'] };
      rateLimit: { max: 100 };
    };
  };

  production: {
    database: {
      url: process.env.DATABASE_URL;
      logging: false;
      ssl: { rejectUnauthorized: true };
      poolSize: 20;
      connectionTimeoutMillis: 30000;
    };
    cache: {
      type: 'redis';
      url: process.env.REDIS_URL;
      cluster: true;
      ttl: 3600;
    };
    security: {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || [];
        credentials: true;
      };
      rateLimit: {
        windowMs: 15 * 60 * 1000;
        max: 100;
        standardHeaders: true;
        legacyHeaders: false;
      };
    };
  };
}

// Load environment-specific configuration
const config = environments[process.env.NODE_ENV || 'development'];
export default config;
```

---

## 🔒 Security Hardening

### SSL/TLS Configuration

```nginx
# config/nginx.conf
server {
    listen 80;
    server_name api.accounting.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.accounting.example.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/accounting-api.crt;
    ssl_certificate_key /etc/nginx/ssl/accounting-api.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'none';" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Proxy Configuration
    location / {
        proxy_pass http://accounting-api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://accounting-api:3000/health;
        access_log off;
    }

    # Block common attack patterns
    location ~* \.(php|asp|aspx|jsp)$ {
        deny all;
    }

    location ~* /\. {
        deny all;
    }
}
```

### Application Security

```typescript
// security/middleware.ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

export const securityMiddleware = [
  // Helmet for security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }),

  // Rate limiting
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        url: req.originalUrl
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: 900
      });
    }
  }),

  // Slow down repeated requests
  slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50,
    delayMs: 500,
    maxDelayMs: 20000
  })
];

// Input validation middleware
export const inputValidationMiddleware = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);

    if (error) {
      logger.warn('Input validation failed', {
        error: error.details,
        body: req.body,
        ip: req.ip
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          code: detail.type
        }))
      });
    }

    next();
  };
};

// SQL injection protection
export const sqlInjectionProtection = (req: Request, res: Response, next: NextFunction) => {
  const sqlInjectionPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i
  ];

  const checkForSQLInjection = (value: string): boolean => {
    return sqlInjectionPatterns.some(pattern => pattern.test(value));
  };

  const checkObject = (obj: any): boolean => {
    for (const key in obj) {
      if (typeof obj[key] === 'string' && checkForSQLInjection(obj[key])) {
        return true;
      } else if (typeof obj[key] === 'object') {
        if (checkObject(obj[key])) return true;
      }
    }
    return false;
  };

  if (checkObject(req.query) || checkObject(req.body) || checkObject(req.params)) {
    logger.error('SQL injection attempt detected', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      url: req.originalUrl,
      query: req.query,
      body: req.body,
      params: req.params
    });

    return res.status(400).json({
      error: 'Invalid request format'
    });
  }

  next();
};
```

### Secrets Management

```bash
#!/bin/bash
# scripts/setup-secrets.sh

# Create secrets using HashiCorp Vault
vault kv put secret/accounting-api/production \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="$(openssl rand -base64 32)" \
  ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  STRIPE_SECRET_KEY="sk_live_..." \
  SMTP_PASSWORD="..."

# Create Kubernetes secrets
kubectl create secret generic accounting-api-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=JWT_SECRET="$(openssl rand -base64 32)" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --namespace=accounting-api

# Set up SSL certificates with Let's Encrypt
certbot certonly --nginx \
  -d api.accounting.example.com \
  --email admin@accounting.example.com \
  --agree-tos \
  --non-interactive

# Automated certificate renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
```

---

## 📊 Monitoring & Logging

### Prometheus Configuration

```yaml
# config/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "/etc/prometheus/alerts.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'accounting-api'
    static_configs:
      - targets: ['accounting-api:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Application Metrics

```typescript
// monitoring/metrics.ts
import prometheus from 'prom-client';

// Create a Registry
const register = new prometheus.Registry();

// Add default metrics
prometheus.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

export const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

export const activeConnections = new prometheus.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

export const databaseQueryDuration = new prometheus.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
});

export const businessMetrics = {
  totalCustomers: new prometheus.Gauge({
    name: 'total_customers',
    help: 'Total number of customers'
  }),

  dailyRevenue: new prometheus.Gauge({
    name: 'daily_revenue',
    help: 'Daily revenue in dollars'
  }),

  invoicesGenerated: new prometheus.Counter({
    name: 'invoices_generated_total',
    help: 'Total number of invoices generated',
    labelNames: ['status']
  }),

  paymentsProcessed: new prometheus.Counter({
    name: 'payments_processed_total',
    help: 'Total number of payments processed',
    labelNames: ['method', 'status']
  })
};

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeConnections);
register.registerMetric(databaseQueryDuration);
register.registerMetric(businessMetrics.totalCustomers);
register.registerMetric(businessMetrics.dailyRevenue);
register.registerMetric(businessMetrics.invoicesGenerated);
register.registerMetric(businessMetrics.paymentsProcessed);

export { register };

// Metrics middleware
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;

    httpRequestDuration
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);

    httpRequestTotal
      .labels(req.method, route, res.statusCode.toString())
      .inc();
  });

  next();
};
```

### Centralized Logging

```typescript
// monitoring/logger.ts
import winston from 'winston';
import 'winston-daily-rotate-file';

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
      service: 'accounting-api',
      environment: process.env.NODE_ENV
    });
  })
);

// Create logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'accounting-api',
    version: process.env.npm_package_version
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // File transport for all logs
    new winston.transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      format: logFormat
    }),

    // Separate file for errors
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '100m',
      maxFiles: '90d',
      format: logFormat
    })
  ],

  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD'
    })
  ],

  // Handle unhandled rejections
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD'
    })
  ]
});

// Log audit events
export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '2555d' // 7 years retention for compliance
    })
  ]
});

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || generateRequestId();

  req.requestId = requestId;

  logger.info('Request started', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    userId: req.user?.id
  });

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id
    });
  });

  next();
};
```

### Health Checks

```typescript
// monitoring/health.ts
interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  responseTime?: number;
  metadata?: any;
}

interface HealthReport {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: HealthCheck[];
}

class HealthChecker {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();

  registerCheck(name: string, checkFn: () => Promise<HealthCheck>) {
    this.checks.set(name, checkFn);
  }

  async runChecks(): Promise<HealthReport> {
    const start = Date.now();
    const results: HealthCheck[] = [];

    for (const [name, checkFn] of this.checks) {
      try {
        const checkStart = Date.now();
        const result = await Promise.race([
          checkFn(),
          new Promise<HealthCheck>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        result.responseTime = Date.now() - checkStart;
        results.push(result);
      } catch (error) {
        results.push({
          name,
          status: 'unhealthy',
          message: error.message,
          responseTime: Date.now() - start
        });
      }
    }

    const overallStatus = this.determineOverallStatus(results);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown',
      checks: results
    };
  }

  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }
}

// Create health checker instance
export const healthChecker = new HealthChecker();

// Database health check
healthChecker.registerCheck('database', async (): Promise<HealthCheck> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: 'database',
      status: 'healthy',
      message: 'Database connection successful'
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      message: `Database connection failed: ${error.message}`
    };
  }
});

// Redis health check
healthChecker.registerCheck('redis', async (): Promise<HealthCheck> => {
  try {
    await redisClient.ping();
    return {
      name: 'redis',
      status: 'healthy',
      message: 'Redis connection successful'
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      message: `Redis connection failed: ${error.message}`
    };
  }
});

// External services health check
healthChecker.registerCheck('stripe', async (): Promise<HealthCheck> => {
  try {
    // Test Stripe connection
    const response = await fetch('https://api.stripe.com/v1/charges?limit=1', {
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
      }
    });

    if (response.ok) {
      return {
        name: 'stripe',
        status: 'healthy',
        message: 'Stripe API accessible'
      };
    } else {
      return {
        name: 'stripe',
        status: 'degraded',
        message: `Stripe API returned ${response.status}`
      };
    }
  } catch (error) {
    return {
      name: 'stripe',
      status: 'unhealthy',
      message: `Stripe connection failed: ${error.message}`
    };
  }
});

// Health check endpoints
export const healthRoutes = (app: Express) => {
  // Basic health check
  app.get('/health', async (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Detailed health check
  app.get('/health/detailed', async (req, res) => {
    const report = await healthChecker.runChecks();
    const statusCode = report.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(report);
  });

  // Readiness check (for Kubernetes)
  app.get('/health/ready', async (req, res) => {
    const report = await healthChecker.runChecks();
    const isReady = report.checks.filter(c => c.name === 'database' || c.name === 'redis')
      .every(c => c.status === 'healthy');

    if (isReady) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', report });
    }
  });

  // Liveness check (for Kubernetes)
  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'alive', uptime: process.uptime() });
  });
};
```

This comprehensive Production Deployment Guide provides everything needed to deploy the Enterprise Accounting API in a production environment with enterprise-grade reliability, security, and monitoring capabilities.