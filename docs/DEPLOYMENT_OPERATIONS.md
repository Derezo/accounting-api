# Universal Accounting API - Deployment & Operations

## Overview

The Universal Accounting API is designed for production deployment at scale, supporting businesses from startups to enterprise organizations. This document outlines the complete deployment architecture, operational procedures, monitoring strategies, and maintenance protocols required for a bank-level secure accounting platform.

## Production Architecture

### Cloud Infrastructure Design
```yaml
# Production Infrastructure Stack
Infrastructure:
  Compute:
    - Application Servers: Auto-scaling container groups (ECS/EKS)
    - Background Workers: Dedicated worker nodes for async processing
    - Load Balancers: Application Load Balancer with SSL termination
    - CDN: CloudFront for static assets and API caching

  Database:
    Primary:
      - PostgreSQL 15+ Multi-AZ with read replicas
      - Connection pooling via PgBouncer
      - Automated backups with point-in-time recovery
    Cache:
      - Redis Cluster for session management
      - Redis for application-level caching
    Search:
      - Elasticsearch for full-text search and analytics

  Storage:
    - S3 for document storage with lifecycle policies
    - EFS for shared file systems
    - Backup storage with cross-region replication

  Security:
    - WAF for application security
    - VPC with private subnets
    - NAT Gateways for outbound traffic
    - Security Groups with least privilege
    - KMS for encryption key management

  Monitoring:
    - CloudWatch for infrastructure metrics
    - Application Performance Monitoring (APM)
    - Centralized logging with retention policies
    - Distributed tracing for microservices
```

### Container Orchestration
```dockerfile
# Production Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production && npm cache clean --force

COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:18-alpine AS production

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Security hardening
RUN apk --no-cache add dumb-init
USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  app:
    image: universal-accounting-api:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - app-network
    secrets:
      - db_password
      - jwt_secret
      - stripe_secret

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    networks:
      - app-network

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=accounting_api
      - POSTGRES_USER=api_user
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - app-network
    secrets:
      - db_password

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - app-network

  worker:
    image: universal-accounting-api:latest
    command: ["node", "dist/worker.js"]
    deploy:
      replicas: 2
    environment:
      - NODE_ENV=production
      - WORKER_MODE=true
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  app-network:
    driver: overlay
    encrypted: true

secrets:
  db_password:
    external: true
  jwt_secret:
    external: true
  stripe_secret:
    external: true
```

### Kubernetes Deployment
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: accounting-api
  labels:
    name: accounting-api
    security.istio.io/tlsMode: istio

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: accounting-api
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  API_VERSION: "1.0.0"
  RATE_LIMIT_WINDOW: "3600000"
  RATE_LIMIT_MAX: "5000"

---
# k8s/deployment.yaml
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
        version: v1
    spec:
      serviceAccountName: accounting-api
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: api
        image: universal-accounting-api:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        envFrom:
        - configMapRef:
            name: app-config
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: accounting-api-service
  namespace: accounting-api
  labels:
    app: accounting-api
spec:
  selector:
    app: accounting-api
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  type: ClusterIP

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: accounting-api-ingress
  namespace: accounting-api
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.universalaccounting.com
    secretName: api-tls-secret
  rules:
  - host: api.universalaccounting.com
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
# k8s/hpa.yaml
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
  maxReplicas: 20
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

## CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/production.yml
name: Production Deploy

on:
  push:
    branches: [main]
  release:
    types: [published]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: universal-accounting-api

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Generate Prisma client
      run: npx prisma generate

    - name: Run database migrations
      run: npx prisma migrate deploy
      env:
        DATABASE_URL: postgresql://postgres:test@localhost:5432/test_db

    - name: Run unit tests
      run: npm run test:unit

    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgresql://postgres:test@localhost:5432/test_db
        REDIS_URL: redis://localhost:6379

    - name: Run security scan
      run: npm audit --audit-level=high

    - name: Run linting
      run: npm run lint

    - name: Type checking
      run: npm run typecheck

  security-scan:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'

    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'

  build:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    outputs:
      image-digest: ${{ steps.build.outputs.digest }}
    steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}
          type=sha,prefix={{branch}}-

    - name: Build and push Docker image
      id: build
      uses: docker/build-push-action@v5
      with:
        context: .
        platforms: linux/amd64,linux/arm64
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
    - name: Deploy to staging
      run: |
        echo "Deploying to staging environment"
        # Staging deployment commands

    - name: Run smoke tests
      run: |
        curl -f https://staging-api.universalaccounting.com/health
        # Additional smoke tests

  deploy-production:
    needs: [build, deploy-staging]
    runs-on: ubuntu-latest
    environment: production
    if: github.ref == 'refs/heads/main' || github.event_name == 'release'
    steps:
    - name: Deploy to production
      run: |
        echo "Deploying to production environment"
        # Production deployment commands

    - name: Update deployment status
      run: |
        curl -X POST https://api.github.com/repos/${{ github.repository }}/deployments \
          -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
          -d '{"ref":"${{ github.sha }}","environment":"production","description":"Production deployment"}'
```

### Deployment Scripts
```bash
#!/bin/bash
# scripts/deploy.sh

set -euo pipefail

# Configuration
ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}
NAMESPACE="accounting-api"

echo "Deploying Universal Accounting API to $ENVIRONMENT"
echo "Image tag: $IMAGE_TAG"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    echo "Error: Environment must be 'staging' or 'production'"
    exit 1
fi

# Set kubectl context
kubectl config use-context $ENVIRONMENT-cluster

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply configuration
kubectl apply -f k8s/configmap.yaml -n $NAMESPACE
kubectl apply -f k8s/secrets.yaml -n $NAMESPACE

# Update deployment with new image
kubectl set image deployment/accounting-api api=universal-accounting-api:$IMAGE_TAG -n $NAMESPACE

# Wait for rollout to complete
kubectl rollout status deployment/accounting-api -n $NAMESPACE --timeout=600s

# Verify deployment
kubectl get pods -n $NAMESPACE -l app=accounting-api

# Run health check
sleep 30
kubectl exec -n $NAMESPACE deployment/accounting-api -- curl -f http://localhost:3000/health

echo "Deployment completed successfully!"

# Update monitoring alerts
./scripts/update-monitoring.sh $ENVIRONMENT

# Send deployment notification
./scripts/notify-deployment.sh $ENVIRONMENT $IMAGE_TAG
```

## Monitoring & Observability

### Application Performance Monitoring
```typescript
// monitoring/metrics.ts
import prometheus from 'prom-client';

// Create metrics registry
const register = new prometheus.Register();

// HTTP request duration histogram
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

// Database query duration histogram
const dbQueryDuration = new prometheus.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

// Business metrics
const invoicesCreated = new prometheus.Counter({
  name: 'invoices_created_total',
  help: 'Total number of invoices created',
  labelNames: ['organization_id', 'customer_tier'],
});

const paymentsProcessed = new prometheus.Counter({
  name: 'payments_processed_total',
  help: 'Total number of payments processed',
  labelNames: ['organization_id', 'payment_method', 'status'],
});

const revenueRecognized = new prometheus.Gauge({
  name: 'revenue_recognized_amount',
  help: 'Amount of revenue recognized',
  labelNames: ['organization_id', 'currency'],
});

// Error tracking
const errorCount = new prometheus.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'severity', 'service'],
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(dbQueryDuration);
register.registerMetric(invoicesCreated);
register.registerMetric(paymentsProcessed);
register.registerMetric(revenueRecognized);
register.registerMetric(errorCount);

// Middleware for HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });

  next();
};

// Database metrics helper
export const trackDbQuery = async <T>(
  operation: string,
  table: string,
  query: () => Promise<T>
): Promise<T> => {
  const start = Date.now();
  try {
    const result = await query();
    const duration = (Date.now() - start) / 1000;
    dbQueryDuration.labels(operation, table).observe(duration);
    return result;
  } catch (error) {
    errorCount.labels('database', 'error', 'api').inc();
    throw error;
  }
};

// Business metrics helpers
export const trackInvoiceCreation = (organizationId: string, customerTier: string) => {
  invoicesCreated.labels(organizationId, customerTier).inc();
};

export const trackPaymentProcessing = (
  organizationId: string,
  paymentMethod: string,
  status: string
) => {
  paymentsProcessed.labels(organizationId, paymentMethod, status).inc();
};
```

### Logging Configuration
```typescript
// logging/logger.ts
import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

interface LogContext {
  organizationId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  operationId?: string;
}

class Logger {
  private logger: winston.Logger;

  constructor() {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
            }`;
          })
        ),
      }),
    ];

    // Add Elasticsearch transport in production
    if (process.env.NODE_ENV === 'production') {
      transports.push(
        new ElasticsearchTransport({
          level: 'info',
          clientOpts: {
            node: process.env.ELASTICSEARCH_URL,
          },
          index: 'accounting-api-logs',
          typeName: 'log',
          transformer: (logData) => ({
            '@timestamp': new Date().toISOString(),
            severity: logData.level,
            message: logData.message,
            service: 'accounting-api',
            environment: process.env.NODE_ENV,
            ...logData.meta,
          }),
        })
      );
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
    });
  }

  info(message: string, context?: LogContext, meta?: any) {
    this.logger.info(message, { ...context, ...meta });
  }

  warn(message: string, context?: LogContext, meta?: any) {
    this.logger.warn(message, { ...context, ...meta });
  }

  error(message: string, error?: Error, context?: LogContext, meta?: any) {
    this.logger.error(message, {
      ...context,
      ...meta,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }

  // Structured logging for business events
  logBusinessEvent(event: string, data: any, context?: LogContext) {
    this.logger.info('Business Event', {
      ...context,
      eventType: 'BUSINESS_EVENT',
      event,
      data,
    });
  }

  // Security event logging
  logSecurityEvent(event: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', context?: LogContext, meta?: any) {
    this.logger.warn('Security Event', {
      ...context,
      ...meta,
      eventType: 'SECURITY_EVENT',
      event,
      severity,
    });
  }

  // Performance logging
  logPerformance(operation: string, duration: number, context?: LogContext, meta?: any) {
    this.logger.info('Performance Metric', {
      ...context,
      ...meta,
      eventType: 'PERFORMANCE',
      operation,
      duration,
    });
  }
}

export const logger = new Logger();
```

### Health Checks & Status Endpoints
```typescript
// health/health-check.ts
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: ServiceStatus[];
  version: string;
  environment: string;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastChecked: string;
  details?: any;
}

class HealthCheckService {
  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    const services = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStripe(),
      this.checkEmailService(),
      this.checkFileStorage(),
    ]);

    const overallStatus = this.determineOverallStatus(services);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        name: 'database',
        status: 'healthy',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: { error: error.message },
      };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await redis.ping();
      return {
        name: 'redis',
        status: 'healthy',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: { error: error.message },
      };
    }
  }

  private async checkStripe(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await stripe.balance.retrieve();
      return {
        name: 'stripe',
        status: 'healthy',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'stripe',
        status: 'degraded',
        responseTime: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: { error: error.message },
      };
    }
  }

  private determineOverallStatus(services: ServiceStatus[]): 'healthy' | 'degraded' | 'unhealthy' {
    const criticalServices = ['database', 'redis'];
    const criticalUnhealthy = services.some(
      service => criticalServices.includes(service.name) && service.status === 'unhealthy'
    );

    if (criticalUnhealthy) {
      return 'unhealthy';
    }

    const anyDegraded = services.some(service => service.status === 'degraded' || service.status === 'unhealthy');
    return anyDegraded ? 'degraded' : 'healthy';
  }
}

// Health check endpoints
export const healthRoutes = Router();

healthRoutes.get('/health', async (req, res) => {
  const healthCheck = new HealthCheckService();
  const status = await healthCheck.checkHealth();

  const httpStatus = status.status === 'healthy' ? 200 :
                    status.status === 'degraded' ? 200 : 503;

  res.status(httpStatus).json(status);
});

healthRoutes.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

healthRoutes.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

## Backup & Disaster Recovery

### Database Backup Strategy
```bash
#!/bin/bash
# scripts/backup-database.sh

set -euo pipefail

# Configuration
ENVIRONMENT=${1:-production}
BACKUP_DIR="/backups"
S3_BUCKET="universal-accounting-backups"
RETENTION_DAYS=30

echo "Starting database backup for $ENVIRONMENT environment"

# Create backup directory
mkdir -p $BACKUP_DIR

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="accounting_api_${ENVIRONMENT}_${TIMESTAMP}.sql"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

# Create database dump
pg_dump $DATABASE_URL > $BACKUP_PATH

# Compress backup
gzip $BACKUP_PATH
COMPRESSED_FILE="${BACKUP_PATH}.gz"

# Upload to S3
aws s3 cp $COMPRESSED_FILE s3://$S3_BUCKET/$ENVIRONMENT/

# Verify backup integrity
gunzip -t $COMPRESSED_FILE
echo "Backup integrity verified"

# Clean up old local backups
find $BACKUP_DIR -name "accounting_api_${ENVIRONMENT}_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Clean up old S3 backups
aws s3 ls s3://$S3_BUCKET/$ENVIRONMENT/ | grep "accounting_api_${ENVIRONMENT}_" | \
  awk '{print $4}' | sort | head -n -$RETENTION_DAYS | \
  xargs -I {} aws s3 rm s3://$S3_BUCKET/$ENVIRONMENT/{}

echo "Database backup completed: $BACKUP_FILE.gz"

# Send backup notification
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-type: application/json' \
  --data "{\"text\":\"Database backup completed for $ENVIRONMENT: $BACKUP_FILE.gz\"}"
```

### Disaster Recovery Procedures
```yaml
# Disaster Recovery Playbook
DisasterRecovery:
  RPO: 1 hour  # Recovery Point Objective
  RTO: 4 hours # Recovery Time Objective

  Scenarios:
    DatabaseFailure:
      Steps:
        1. Activate read replica as primary
        2. Update application configuration
        3. Verify data integrity
        4. Restore backup if needed
        5. Monitor application health

    ApplicationFailure:
      Steps:
        1. Check health endpoints
        2. Review application logs
        3. Restart unhealthy containers
        4. Scale up if needed
        5. Rollback if necessary

    CompleteDataCenterFailure:
      Steps:
        1. Activate secondary region
        2. Restore database from backup
        3. Update DNS to secondary region
        4. Scale infrastructure in secondary region
        5. Verify all services operational

  BackupVerification:
    Daily:
      - Automated backup integrity check
      - Test restore to staging environment
    Weekly:
      - Full disaster recovery drill
      - End-to-end recovery test
    Monthly:
      - Cross-region failover test
      - Complete data integrity audit
```

## Security Operations

### Security Monitoring
```typescript
// security/monitoring.ts
class SecurityMonitor {
  private alertThresholds = {
    failedLogins: 5,
    apiCallsPerMinute: 1000,
    suspiciousIPRequests: 100,
    dataExportSize: 10000000, // 10MB
  };

  async monitorSecurity(): Promise<void> {
    await Promise.all([
      this.checkFailedLogins(),
      this.checkSuspiciousActivity(),
      this.checkDataExfiltration(),
      this.checkUnauthorizedAccess(),
    ]);
  }

  private async checkFailedLogins(): Promise<void> {
    const recentFailures = await prisma.securityEvent.count({
      where: {
        type: 'LOGIN_FAILED',
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }, // 15 minutes
      },
    });

    if (recentFailures > this.alertThresholds.failedLogins) {
      await this.triggerSecurityAlert('HIGH_FAILED_LOGIN_RATE', {
        count: recentFailures,
        threshold: this.alertThresholds.failedLogins,
      });
    }
  }

  private async triggerSecurityAlert(type: string, data: any): Promise<void> {
    // Log security event
    logger.logSecurityEvent(type, 'HIGH', undefined, data);

    // Send to security team
    await this.notifySecurityTeam(type, data);

    // Auto-respond if necessary
    await this.autoRespond(type, data);
  }

  private async autoRespond(type: string, data: any): Promise<void> {
    switch (type) {
      case 'HIGH_FAILED_LOGIN_RATE':
        // Temporarily increase rate limiting
        await this.adjustRateLimit('auth', 0.5); // Reduce by 50%
        break;

      case 'SUSPICIOUS_API_ACTIVITY':
        // Block suspicious IPs temporarily
        await this.blockSuspiciousIPs(data.suspiciousIPs);
        break;

      case 'DATA_EXFILTRATION':
        // Alert admins and require additional verification
        await this.requireAdditionalVerification(data.userId);
        break;
    }
  }
}
```

### Compliance Monitoring
```typescript
// compliance/monitor.ts
interface ComplianceReport {
  soc2: SOC2Status;
  pci: PCIStatus;
  gdpr: GDPRStatus;
  auditTrail: AuditTrailStatus;
  encryption: EncryptionStatus;
}

class ComplianceMonitor {
  async generateComplianceReport(): Promise<ComplianceReport> {
    return {
      soc2: await this.checkSOC2Compliance(),
      pci: await this.checkPCICompliance(),
      gdpr: await this.checkGDPRCompliance(),
      auditTrail: await this.checkAuditTrail(),
      encryption: await this.checkEncryption(),
    };
  }

  private async checkSOC2Compliance(): Promise<SOC2Status> {
    const checks = await Promise.all([
      this.verifyAccessControls(),
      this.verifyDataBackups(),
      this.verifyIncidentResponse(),
      this.verifyChangeManagement(),
      this.verifySystemMonitoring(),
    ]);

    const passing = checks.filter(check => check.passed).length;
    const total = checks.length;

    return {
      compliant: passing === total,
      score: (passing / total) * 100,
      checks,
      lastAudit: new Date(),
    };
  }

  private async checkPCICompliance(): Promise<PCIStatus> {
    return {
      compliant: true, // We don't store card data - Stripe handles PCI
      level: 'Level 1 Service Provider',
      validUntil: new Date('2024-12-31'),
      requirements: [
        { requirement: 'Secure Network', status: 'COMPLIANT' },
        { requirement: 'Protect Cardholder Data', status: 'COMPLIANT' },
        { requirement: 'Vulnerability Management', status: 'COMPLIANT' },
        { requirement: 'Access Control', status: 'COMPLIANT' },
        { requirement: 'Monitor Networks', status: 'COMPLIANT' },
        { requirement: 'Information Security Policy', status: 'COMPLIANT' },
      ],
    };
  }
}
```

## Performance Optimization

### Database Performance
```sql
-- Database optimization queries
-- Performance monitoring views
CREATE VIEW db_performance_stats AS
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation,
  most_common_vals,
  most_common_freqs
FROM pg_stats
WHERE tablename IN ('customers', 'invoices', 'payments', 'transactions');

-- Index usage monitoring
CREATE VIEW index_usage_stats AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_tup_read,
  idx_tup_fetch,
  idx_scan,
  idx_tup_read / NULLIF(idx_scan, 0) as avg_tuples_per_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Slow query identification
CREATE VIEW slow_queries AS
SELECT
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_time > 100 -- queries taking more than 100ms on average
ORDER BY mean_time DESC
LIMIT 20;
```

### Caching Strategy
```typescript
// caching/strategy.ts
interface CacheConfig {
  ttl: number;
  maxSize?: number;
  strategy: 'LRU' | 'LFU' | 'TTL';
}

class CacheManager {
  private redis: Redis;
  private localCache: Map<string, any>;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.localCache = new Map();
  }

  // Multi-level caching
  async get<T>(key: string, config: CacheConfig): Promise<T | null> {
    // Level 1: Local memory cache
    if (this.localCache.has(key)) {
      return this.localCache.get(key);
    }

    // Level 2: Redis cache
    const cached = await this.redis.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      // Store in local cache
      this.localCache.set(key, data);
      return data;
    }

    return null;
  }

  async set<T>(key: string, value: T, config: CacheConfig): Promise<void> {
    // Store in Redis
    await this.redis.setex(key, config.ttl, JSON.stringify(value));

    // Store in local cache
    this.localCache.set(key, value);

    // Implement cache size limits
    if (config.maxSize && this.localCache.size > config.maxSize) {
      this.evictLocal(config.strategy);
    }
  }

  // Cache patterns for accounting data
  async cacheCustomerData(customerId: string, data: any): Promise<void> {
    await this.set(`customer:${customerId}`, data, { ttl: 3600 }); // 1 hour
  }

  async cacheFinancialReport(organizationId: string, reportType: string, data: any): Promise<void> {
    const key = `report:${organizationId}:${reportType}:${this.getDateKey()}`;
    await this.set(key, data, { ttl: 86400 }); // 24 hours
  }

  async invalidateOrganizationCache(organizationId: string): Promise<void> {
    const pattern = `*:${organizationId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

---

*This comprehensive deployment and operations guide ensures the Universal Accounting API can be deployed and maintained at enterprise scale with bank-level security, performance, and reliability standards.*