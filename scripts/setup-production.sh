#!/bin/bash

# Production Setup Script for Accounting API
# Bank-level security deployment automation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${1:-"accounting-api.yourdomain.com"}
EMAIL=${2:-"admin@yourdomain.com"}
ENVIRONMENT="production"

echo -e "${BLUE}=== Accounting API Production Setup ===${NC}"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "Environment: $ENVIRONMENT"
echo ""

# Function to generate secure password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Function to generate encryption key
generate_encryption_key() {
    openssl rand -hex 32
}

# Function to create Docker secrets
create_docker_secrets() {
    echo -e "${BLUE}Creating Docker secrets...${NC}"

    # Generate passwords and keys
    POSTGRES_PASSWORD=$(generate_password)
    REDIS_PASSWORD=$(generate_password)
    JWT_SECRET=$(generate_encryption_key)
    JWT_REFRESH_SECRET=$(generate_encryption_key)
    ENCRYPTION_KEY=$(generate_encryption_key)
    API_KEY_SALT=$(generate_encryption_key)
    ELASTIC_PASSWORD=$(generate_password)
    GRAFANA_PASSWORD=$(generate_password)

    # Create secret files
    echo "$POSTGRES_PASSWORD" | docker secret create postgres_password - 2>/dev/null || true
    echo "$REDIS_PASSWORD" | docker secret create redis_password - 2>/dev/null || true
    echo "$JWT_SECRET" | docker secret create jwt_secret - 2>/dev/null || true
    echo "$JWT_REFRESH_SECRET" | docker secret create jwt_refresh_secret - 2>/dev/null || true
    echo "$ENCRYPTION_KEY" | docker secret create encryption_key - 2>/dev/null || true
    echo "$API_KEY_SALT" | docker secret create api_key_salt - 2>/dev/null || true
    echo "$ELASTIC_PASSWORD" | docker secret create elastic_password - 2>/dev/null || true
    echo "$GRAFANA_PASSWORD" | docker secret create grafana_password - 2>/dev/null || true

    # Stripe secrets (to be configured manually)
    if [ ! -f ".stripe_secret" ]; then
        echo "sk_live_REPLACE_WITH_ACTUAL_STRIPE_SECRET" > .stripe_secret
        echo "whsec_REPLACE_WITH_ACTUAL_WEBHOOK_SECRET" > .stripe_webhook_secret
        echo -e "${YELLOW}⚠️  Please update .stripe_secret and .stripe_webhook_secret with actual Stripe keys${NC}"
    fi

    cat .stripe_secret | docker secret create stripe_secret_key - 2>/dev/null || true
    cat .stripe_webhook_secret | docker secret create stripe_webhook_secret - 2>/dev/null || true

    echo -e "${GREEN}✓ Docker secrets created${NC}"

    # Save passwords to secure file
    cat > .production-credentials << EOF
# Production Credentials - KEEP SECURE
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
API_KEY_SALT=$API_KEY_SALT
ELASTIC_PASSWORD=$ELASTIC_PASSWORD
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF

    chmod 600 .production-credentials
    echo -e "${GREEN}✓ Credentials saved to .production-credentials${NC}"
}

# Function to setup SSL certificates
setup_ssl_certificates() {
    echo -e "${BLUE}Setting up SSL certificates...${NC}"

    mkdir -p docker/nginx/ssl

    if command -v certbot &> /dev/null; then
        # Use Let's Encrypt for production
        echo "Obtaining SSL certificate from Let's Encrypt..."

        # Create temporary nginx config for certificate validation
        cat > docker/nginx/conf.d/temp.conf << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF

        # Start nginx for certificate validation
        docker run -d --name temp-nginx \
            -p 80:80 \
            -v $(pwd)/docker/nginx/conf.d:/etc/nginx/conf.d:ro \
            -v certbot-www:/var/www/certbot \
            nginx:alpine

        # Get certificate
        docker run --rm \
            -v certbot-certs:/etc/letsencrypt \
            -v certbot-www:/var/www/certbot \
            certbot/certbot certonly \
            --webroot \
            --webroot-path=/var/www/certbot \
            --email $EMAIL \
            --agree-tos \
            --no-eff-email \
            -d $DOMAIN

        # Copy certificates
        docker run --rm \
            -v certbot-certs:/etc/letsencrypt \
            -v $(pwd)/docker/nginx/ssl:/ssl \
            alpine:latest sh -c "
                cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /ssl/cert.pem
                cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /ssl/key.pem
                chmod 644 /ssl/cert.pem
                chmod 600 /ssl/key.pem
            "

        # Clean up
        docker stop temp-nginx
        docker rm temp-nginx

        echo -e "${GREEN}✓ SSL certificate obtained from Let's Encrypt${NC}"
    else
        # Generate self-signed certificate for development
        echo "Generating self-signed certificate..."

        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout docker/nginx/ssl/key.pem \
            -out docker/nginx/ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

        echo -e "${YELLOW}⚠️  Self-signed certificate generated. Replace with proper SSL certificate for production.${NC}"
    fi

    # Generate DH parameters for better security
    if [ ! -f "docker/nginx/dhparam.pem" ]; then
        echo "Generating DH parameters (this may take a while)..."
        openssl dhparam -out docker/nginx/dhparam.pem 2048
        echo -e "${GREEN}✓ DH parameters generated${NC}"
    fi
}

# Function to create production configuration files
create_production_configs() {
    echo -e "${BLUE}Creating production configuration files...${NC}"

    # PostgreSQL production configuration
    cat > docker/postgres/postgresql.conf << EOF
# PostgreSQL Production Configuration for Bank-level Security

# Connection Settings
listen_addresses = '*'
port = 5432
max_connections = 200
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200

# WAL and Checkpoints
wal_level = replica
max_wal_size = 2GB
min_wal_size = 1GB
checkpoint_timeout = 5min
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/archive/%f'

# Replication
hot_standby = on
max_wal_senders = 3
wal_keep_size = 1GB

# Logging
log_destination = 'stderr'
logging_collector = on
log_directory = 'logs'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_file_mode = 0600
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000
log_connections = on
log_disconnections = on
log_lock_waits = on
log_statement = 'ddl'
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

# Security
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
password_encryption = scram-sha-256
row_security = on
EOF

    # Redis production configuration
    cat > docker/redis/redis.prod.conf << EOF
# Redis Production Configuration

# Network
bind 0.0.0.0
port 6379
timeout 300
tcp-keepalive 60

# Authentication
requirepass \$(cat /run/secrets/redis_password)

# Security
protected-mode yes
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
rename-command CONFIG "CONFIG_$(openssl rand -hex 16)"
rename-command SHUTDOWN "SHUTDOWN_$(openssl rand -hex 16)"
rename-command DEBUG ""
rename-command EVAL ""

# Memory
maxmemory 1gb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename accounting.rdb

# AOF
appendonly yes
appendfilename "accounting.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Logging
loglevel notice

# Clients
maxclients 10000

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Latency monitoring
latency-monitor-threshold 100
EOF

    # Nginx production configuration
    cat > docker/nginx/nginx.prod.conf << EOF
# Nginx Production Configuration

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Security headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;

    # Hide server information
    server_tokens off;

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=auth:10m rate=5r/s;
    limit_req_zone \$binary_remote_addr zone=api:10m rate=20r/s;
    limit_conn_zone \$binary_remote_addr zone=conn_limit_per_ip:10m;

    # Logging
    log_format main '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                    '\$status \$body_bytes_sent "\$http_referer" '
                    '"\$http_user_agent" "\$http_x_forwarded_for" '
                    'rt=\$request_time uct="\$upstream_connect_time" '
                    'uht="\$upstream_header_time" urt="\$upstream_response_time"';

    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    send_timeout 60s;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    include /etc/nginx/conf.d/*.conf;
}
EOF

    # Production Nginx site configuration
    cat > docker/nginx/conf.d/production.conf << EOF
upstream api_backend {
    least_conn;
    server api-1:3000 max_fails=3 fail_timeout=30s;
    server api-2:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_dhparam /etc/nginx/dhparam.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Health check
    location = /health {
        access_log off;
        proxy_pass http://api_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Authentication endpoints
    location ~* ^/api/v[0-9]+/auth/ {
        limit_req zone=auth burst=10 nodelay;
        limit_conn conn_limit_per_ip 5;

        proxy_pass http://api_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Request-ID \$request_id;

        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # API endpoints
    location ~* ^/api/ {
        limit_req zone=api burst=30 nodelay;
        limit_conn conn_limit_per_ip 10;

        proxy_pass http://api_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Request-ID \$request_id;

        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
    }

    # Block all other requests
    location / {
        return 404;
    }

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}
EOF

    echo -e "${GREEN}✓ Production configuration files created${NC}"
}

# Function to setup monitoring
setup_monitoring() {
    echo -e "${BLUE}Setting up monitoring configuration...${NC}"

    mkdir -p docker/prometheus docker/grafana/dashboards docker/grafana/datasources docker/logstash/pipeline

    # Prometheus configuration
    cat > docker/prometheus/prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:80']

  - job_name: 'api'
    static_configs:
      - targets: ['api-1:3000', 'api-2:3000']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-primary:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-master:6379']
EOF

    # Grafana datasource
    cat > docker/grafana/datasources/prometheus.yml << EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

    # Logstash pipeline
    cat > docker/logstash/pipeline/logstash.conf << EOF
input {
  file {
    path => "/usr/share/logstash/logs/nginx/access.log"
    start_position => "beginning"
    type => "nginx_access"
  }
  file {
    path => "/usr/share/logstash/logs/app.log"
    start_position => "beginning"
    type => "application"
  }
}

filter {
  if [type] == "nginx_access" {
    grok {
      match => { "message" => "%{NGINXACCESS}" }
    }
  }

  if [type] == "application" {
    json {
      source => "message"
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "accounting-api-%{+YYYY.MM.dd}"
  }
}
EOF

    echo -e "${GREEN}✓ Monitoring configuration created${NC}"
}

# Function to setup firewall rules
setup_firewall() {
    echo -e "${BLUE}Setting up firewall rules...${NC}"

    if command -v ufw &> /dev/null; then
        # Enable UFW
        ufw --force enable

        # Default policies
        ufw default deny incoming
        ufw default allow outgoing

        # Allow SSH
        ufw allow ssh

        # Allow HTTP and HTTPS
        ufw allow 80/tcp
        ufw allow 443/tcp

        # Allow only local access to admin interfaces
        ufw allow from 127.0.0.1 to any port 5601  # Kibana
        ufw allow from 127.0.0.1 to any port 3001  # Grafana
        ufw allow from 127.0.0.1 to any port 9090  # Prometheus

        # Reload firewall
        ufw reload

        echo -e "${GREEN}✓ Firewall configured${NC}"
    else
        echo -e "${YELLOW}⚠️  UFW not found. Please configure firewall manually.${NC}"
    fi
}

# Function to create systemd service
create_systemd_service() {
    echo -e "${BLUE}Creating systemd service...${NC}"

    cat > /etc/systemd/system/accounting-api.service << EOF
[Unit]
Description=Accounting API Production Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker-compose -f docker-compose.production.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.production.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable accounting-api.service

    echo -e "${GREEN}✓ Systemd service created${NC}"
}

# Function to setup backup cron job
setup_backup_cron() {
    echo -e "${BLUE}Setting up backup cron job...${NC}"

    # Create backup script
    cat > /usr/local/bin/accounting-backup << EOF
#!/bin/bash
cd $(pwd)
docker-compose -f docker-compose.production.yml --profile backup up backup
find ./backups -name "accounting_backup_*.sql.gz" -mtime +30 -delete
EOF

    chmod +x /usr/local/bin/accounting-backup

    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/accounting-backup") | crontab -

    echo -e "${GREEN}✓ Backup cron job configured${NC}"
}

# Function to initialize database
initialize_database() {
    echo -e "${BLUE}Initializing database...${NC}"

    # Wait for database to be ready
    echo "Waiting for database to be ready..."
    sleep 30

    # Run Prisma migrations
    docker-compose -f docker-compose.production.yml exec api-1 npx prisma migrate deploy

    echo -e "${GREEN}✓ Database initialized${NC}"
}

# Function to run security tests
run_security_tests() {
    echo -e "${BLUE}Running security tests...${NC}"

    # Install Node.js dependencies for security tests
    cd security-tests
    npm install axios
    cd ..

    # Run security test suite
    node security-tests/security-test-suite.js "https://$DOMAIN"

    # Run penetration tests
    ./security-tests/penetration-tests.sh "https://$DOMAIN"

    echo -e "${GREEN}✓ Security tests completed${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Starting production setup...${NC}"

    # Check prerequisites
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker is not installed${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}✗ Docker Compose is not installed${NC}"
        exit 1
    fi

    # Create directories
    mkdir -p logs/nginx backups security-reports

    # Setup steps
    create_docker_secrets
    setup_ssl_certificates
    create_production_configs
    setup_monitoring
    setup_firewall
    create_systemd_service
    setup_backup_cron

    # Deploy stack
    echo -e "${BLUE}Deploying production stack...${NC}"
    docker-compose -f docker-compose.production.yml up -d

    # Initialize database
    initialize_database

    # Run security tests
    run_security_tests

    echo ""
    echo -e "${GREEN}=== Production setup completed successfully! ===${NC}"
    echo ""
    echo "Access points:"
    echo "  API: https://$DOMAIN"
    echo "  Kibana: http://localhost:5601"
    echo "  Grafana: http://localhost:3001"
    echo "  Prometheus: http://localhost:9090"
    echo ""
    echo "Important files:"
    echo "  Credentials: .production-credentials (keep secure!)"
    echo "  SSL Certificate: docker/nginx/ssl/"
    echo "  Logs: logs/"
    echo "  Backups: backups/"
    echo ""
    echo -e "${YELLOW}⚠️  Don't forget to:${NC}"
    echo "  1. Update Stripe keys in Docker secrets"
    echo "  2. Configure DNS to point to this server"
    echo "  3. Set up external backup storage"
    echo "  4. Configure monitoring alerts"
    echo "  5. Review and test disaster recovery procedures"
}

# Run main function
main "$@"