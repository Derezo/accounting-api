#!/bin/bash
# =============================================================================
# Production Installation Script
# Lifestream Dynamics Universal Accounting API
# =============================================================================
# This script installs all required dependencies on the production server.
# It checks for existing installations and only installs what's missing.
# Run once during initial server setup.
#
# Usage: ./scripts/install-production.sh
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
if [ ! -f ".env.production" ]; then
    echo -e "${RED}ERROR: .env.production file not found${NC}"
    echo "Please create .env.production file before running this script"
    exit 1
fi

# Source environment variables (properly handle values with spaces)
set -a
source .env.production
set +a

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Accounting API - Production Installation Script           ║${NC}"
echo -e "${BLUE}║     Target: ${DEPLOY_HOST}                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# STEP 1: System Updates
# =============================================================================
echo -e "${YELLOW}[1/10] Updating system packages...${NC}"
ssh root@${DEPLOY_HOST} "DEBIAN_FRONTEND=noninteractive apt-get update -qq" 2>&1 | grep -v "^$" || true
echo -e "${GREEN}✓ System packages updated${NC}"
echo ""

# =============================================================================
# STEP 2: Check/Install PostgreSQL
# =============================================================================
echo -e "${YELLOW}[2/10] Checking PostgreSQL installation...${NC}"
if ssh root@${DEPLOY_HOST} "which psql > /dev/null 2>&1"; then
    PG_VERSION=$(ssh root@${DEPLOY_HOST} "psql --version" | awk '{print $3}')
    echo -e "${GREEN}✓ PostgreSQL already installed (version ${PG_VERSION})${NC}"
else
    echo -e "${BLUE}→ Installing PostgreSQL 16...${NC}"
    ssh root@${DEPLOY_HOST} << 'EOF'
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 postgresql-contrib-16 > /dev/null
        systemctl enable postgresql
        systemctl start postgresql
        sleep 3
EOF
    echo -e "${GREEN}✓ PostgreSQL 16 installed and started${NC}"
fi
echo ""

# =============================================================================
# STEP 3: Check/Install Node.js
# =============================================================================
echo -e "${YELLOW}[3/10] Checking Node.js installation...${NC}"
if ssh root@${DEPLOY_HOST} "which node > /dev/null 2>&1"; then
    NODE_VERSION=$(ssh root@${DEPLOY_HOST} "node --version")
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')

    if [ "$NODE_MAJOR" -ge 20 ]; then
        echo -e "${GREEN}✓ Node.js already installed (${NODE_VERSION})${NC}"
    else
        echo -e "${YELLOW}→ Node.js ${NODE_VERSION} found, but version 20+ required${NC}"
        echo -e "${BLUE}→ Upgrading Node.js...${NC}"
        ssh root@${DEPLOY_HOST} << 'EOF'
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
            DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs > /dev/null
EOF
        echo -e "${GREEN}✓ Node.js upgraded${NC}"
    fi
else
    echo -e "${BLUE}→ Installing Node.js 20.x...${NC}"
    ssh root@${DEPLOY_HOST} << 'EOF'
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs > /dev/null
EOF
    NEW_NODE_VERSION=$(ssh root@${DEPLOY_HOST} "node --version")
    echo -e "${GREEN}✓ Node.js installed (${NEW_NODE_VERSION})${NC}"
fi
echo ""

# =============================================================================
# STEP 4: Check/Install PM2
# =============================================================================
echo -e "${YELLOW}[4/10] Checking PM2 installation...${NC}"
if ssh root@${DEPLOY_HOST} "which pm2 > /dev/null 2>&1"; then
    PM2_VERSION=$(ssh root@${DEPLOY_HOST} "pm2 --version")
    echo -e "${GREEN}✓ PM2 already installed (version ${PM2_VERSION})${NC}"
else
    echo -e "${BLUE}→ Installing PM2...${NC}"
    ssh root@${DEPLOY_HOST} "npm install -g pm2 > /dev/null 2>&1"
    ssh root@${DEPLOY_HOST} "pm2 startup systemd -u root --hp /root" > /dev/null 2>&1
    echo -e "${GREEN}✓ PM2 installed and configured${NC}"
fi
echo ""

# =============================================================================
# STEP 5: Check/Install Nginx
# =============================================================================
echo -e "${YELLOW}[5/10] Checking Nginx installation...${NC}"
if ssh root@${DEPLOY_HOST} "which nginx > /dev/null 2>&1"; then
    NGINX_VERSION=$(ssh root@${DEPLOY_HOST} "nginx -v 2>&1" | awk '{print $3}')
    echo -e "${GREEN}✓ Nginx already installed (${NGINX_VERSION})${NC}"
else
    echo -e "${BLUE}→ Installing Nginx...${NC}"
    ssh root@${DEPLOY_HOST} "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx > /dev/null"
    ssh root@${DEPLOY_HOST} "systemctl enable nginx && systemctl start nginx"
    echo -e "${GREEN}✓ Nginx installed and started${NC}"
fi
echo ""

# =============================================================================
# STEP 6: Check/Install Certbot (for SSL)
# =============================================================================
echo -e "${YELLOW}[6/10] Checking Certbot installation...${NC}"
if ssh root@${DEPLOY_HOST} "which certbot > /dev/null 2>&1"; then
    CERTBOT_VERSION=$(ssh root@${DEPLOY_HOST} "certbot --version" | awk '{print $2}')
    echo -e "${GREEN}✓ Certbot already installed (version ${CERTBOT_VERSION})${NC}"
else
    echo -e "${BLUE}→ Installing Certbot...${NC}"
    ssh root@${DEPLOY_HOST} "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx > /dev/null"
    echo -e "${GREEN}✓ Certbot installed${NC}"
fi
echo ""

# =============================================================================
# STEP 7: Create Application User
# =============================================================================
echo -e "${YELLOW}[7/10] Creating application user...${NC}"
if ssh root@${DEPLOY_HOST} "id ${DEPLOY_USER} > /dev/null 2>&1"; then
    echo -e "${GREEN}✓ User '${DEPLOY_USER}' already exists${NC}"
else
    echo -e "${BLUE}→ Creating user '${DEPLOY_USER}'...${NC}"
    ssh root@${DEPLOY_HOST} "useradd -m -s /bin/bash ${DEPLOY_USER}"
    echo -e "${GREEN}✓ User created${NC}"
fi
echo ""

# =============================================================================
# STEP 8: Create Directory Structure
# =============================================================================
echo -e "${YELLOW}[8/10] Creating directory structure...${NC}"
ssh root@${DEPLOY_HOST} << EOF
    mkdir -p ${DEPLOY_PATH}
    mkdir -p ${DEPLOY_PATH}/logs
    mkdir -p ${DEPLOY_PATH}/uploads
    mkdir -p /var/backups/accounting-api
    chown -R ${DEPLOY_USER}:${DEPLOY_USER} ${DEPLOY_PATH}
    chmod 755 ${DEPLOY_PATH}
    chmod 755 ${DEPLOY_PATH}/logs
    chmod 755 ${DEPLOY_PATH}/uploads
EOF
echo -e "${GREEN}✓ Directory structure created${NC}"
echo ""

# =============================================================================
# STEP 9: Setup PostgreSQL Database
# =============================================================================
echo -e "${YELLOW}[9/10] Setting up PostgreSQL database...${NC}"

# Check if database exists
DB_EXISTS=$(ssh root@${DEPLOY_HOST} "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\" 2>/dev/null" || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    echo -e "${GREEN}✓ Database '${DB_NAME}' already exists${NC}"
else
    echo -e "${BLUE}→ Creating database '${DB_NAME}'...${NC}"
    ssh root@${DEPLOY_HOST} << EOF
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};" 2>&1 | grep -v "^$" || true
EOF
    echo -e "${GREEN}✓ Database created${NC}"
fi

# Check if user exists
USER_EXISTS=$(ssh root@${DEPLOY_HOST} "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\" 2>/dev/null" || echo "0")

if [ "$USER_EXISTS" = "1" ]; then
    echo -e "${GREEN}✓ Database user '${DB_USER}' already exists${NC}"
    echo -e "${BLUE}→ Updating user password...${NC}"
    ssh root@${DEPLOY_HOST} "sudo -u postgres psql -c \"ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';\" 2>&1" | grep -v "^$" || true
    echo -e "${GREEN}✓ Password updated${NC}"
else
    echo -e "${BLUE}→ Creating database user '${DB_USER}'...${NC}"
    ssh root@${DEPLOY_HOST} << EOF
        sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" 2>&1 | grep -v "^$" || true
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>&1 | grep -v "^$" || true
        sudo -u postgres psql -d ${DB_NAME} -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" 2>&1 | grep -v "^$" || true
EOF
    echo -e "${GREEN}✓ Database user created and granted privileges${NC}"
fi
echo ""

# =============================================================================
# STEP 10: Install Additional Tools
# =============================================================================
echo -e "${YELLOW}[10/10] Installing additional tools...${NC}"

# Check/Install git
if ssh root@${DEPLOY_HOST} "which git > /dev/null 2>&1"; then
    echo -e "${GREEN}✓ Git already installed${NC}"
else
    echo -e "${BLUE}→ Installing Git...${NC}"
    ssh root@${DEPLOY_HOST} "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git > /dev/null"
    echo -e "${GREEN}✓ Git installed${NC}"
fi

# Check/Install build essentials
if ssh root@${DEPLOY_HOST} "dpkg -l | grep build-essential > /dev/null 2>&1"; then
    echo -e "${GREEN}✓ Build tools already installed${NC}"
else
    echo -e "${BLUE}→ Installing build tools...${NC}"
    ssh root@${DEPLOY_HOST} "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential > /dev/null"
    echo -e "${GREEN}✓ Build tools installed${NC}"
fi

# Check/Install logrotate
if ssh root@${DEPLOY_HOST} "which logrotate > /dev/null 2>&1"; then
    echo -e "${GREEN}✓ Logrotate already installed${NC}"
else
    echo -e "${BLUE}→ Installing logrotate...${NC}"
    ssh root@${DEPLOY_HOST} "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq logrotate > /dev/null"
    echo -e "${GREEN}✓ Logrotate installed${NC}"
fi

echo ""

# =============================================================================
# STEP 11: Setup Logrotate Configuration
# =============================================================================
echo -e "${YELLOW}[11/10] Configuring log rotation...${NC}"
ssh root@${DEPLOY_HOST} "cat > /etc/logrotate.d/accounting-api << 'LOGROTATE_EOF'
${DEPLOY_PATH}/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ${DEPLOY_USER} ${DEPLOY_USER}
    sharedscripts
    postrotate
        pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
LOGROTATE_EOF
"
echo -e "${GREEN}✓ Logrotate configured${NC}"
echo ""

# =============================================================================
# Installation Complete
# =============================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Installation Complete!                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ All requirements installed successfully${NC}"
echo ""
echo -e "${YELLOW}Installed components:${NC}"
ssh root@${DEPLOY_HOST} << 'EOF'
    echo "  • PostgreSQL:  $(psql --version | awk '{print $3}')"
    echo "  • Node.js:     $(node --version)"
    echo "  • npm:         $(npm --version)"
    echo "  • PM2:         $(pm2 --version)"
    echo "  • Nginx:       $(nginx -v 2>&1 | awk '{print $3}')"
    echo "  • Certbot:     $(certbot --version | awk '{print $2}')"
    echo "  • Git:         $(git --version | awk '{print $3}')"
EOF
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Update .env.production with secure passwords and secrets"
echo "  2. Run: ./scripts/deploy-production.sh"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"