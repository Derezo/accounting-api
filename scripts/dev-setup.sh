#!/bin/bash

# Development Setup Script for Accounting API
# Quick setup for local development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Accounting API Development Setup ===${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker is not installed${NC}"
        echo "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}✗ Docker Compose is not installed${NC}"
        echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js is not installed${NC}"
        echo "Please install Node.js 18+: https://nodejs.org/"
        exit 1
    fi

    echo -e "${GREEN}✓ All prerequisites met${NC}"
}

# Setup environment variables
setup_environment() {
    echo -e "${BLUE}Setting up environment variables...${NC}"

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            echo -e "${GREEN}✓ Created .env from .env.example${NC}"
        else
            echo -e "${YELLOW}⚠️  .env.example not found, creating basic .env${NC}"
            cat > .env << EOF
NODE_ENV=development
PORT=3000
API_VERSION=v1
DATABASE_URL="postgresql://postgres:postgres_password@localhost:5432/accounting_db?schema=public"
REDIS_URL=redis://:redis_password@localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=dev-encryption-key-32-chars-long
API_KEY_SALT=dev-api-key-salt
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=debug
DEFAULT_CURRENCY=CAD
DEFAULT_TAX_RATE=0.13
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
EOF
        fi
    else
        echo -e "${GREEN}✓ .env already exists${NC}"
    fi
}

# Install dependencies
install_dependencies() {
    echo -e "${BLUE}Installing Node.js dependencies...${NC}"

    if [ -f "package.json" ]; then
        npm install
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    else
        echo -e "${RED}✗ package.json not found${NC}"
        exit 1
    fi
}

# Create necessary directories
create_directories() {
    echo -e "${BLUE}Creating necessary directories...${NC}"

    mkdir -p logs/nginx
    mkdir -p backups
    mkdir -p security-reports

    echo -e "${GREEN}✓ Directories created${NC}"
}

# Generate self-signed SSL certificate for development
generate_ssl_cert() {
    echo -e "${BLUE}Generating self-signed SSL certificate...${NC}"

    mkdir -p docker/nginx/ssl

    if [ ! -f "docker/nginx/ssl/cert.pem" ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout docker/nginx/ssl/key.pem \
            -out docker/nginx/ssl/cert.pem \
            -subj "/C=US/ST=Dev/L=Development/O=DevOrg/CN=localhost"

        echo -e "${GREEN}✓ Self-signed SSL certificate generated${NC}"
    else
        echo -e "${GREEN}✓ SSL certificate already exists${NC}"
    fi
}

# Start development stack
start_development_stack() {
    echo -e "${BLUE}Starting development stack...${NC}"

    # Pull latest images
    docker-compose pull

    # Build and start services
    docker-compose up -d

    echo -e "${GREEN}✓ Development stack started${NC}"
}

# Wait for services to be ready
wait_for_services() {
    echo -e "${BLUE}Waiting for services to be ready...${NC}"

    # Wait for PostgreSQL
    echo "Waiting for PostgreSQL..."
    until docker-compose exec postgres pg_isready -U postgres -d accounting_db; do
        sleep 2
    done

    # Wait for Redis
    echo "Waiting for Redis..."
    until docker-compose exec redis redis-cli --no-auth-warning -a redis_password ping; do
        sleep 2
    done

    # Wait for API
    echo "Waiting for API..."
    until curl -s http://localhost:3000/health > /dev/null; do
        sleep 2
    done

    echo -e "${GREEN}✓ All services are ready${NC}"
}

# Setup database
setup_database() {
    echo -e "${BLUE}Setting up database...${NC}"

    # Generate Prisma client
    npx prisma generate

    # Run migrations
    npx prisma migrate dev --name init

    # Seed database (if seed file exists)
    if [ -f "prisma/seed.ts" ]; then
        npm run prisma:seed
        echo -e "${GREEN}✓ Database seeded${NC}"
    fi

    echo -e "${GREEN}✓ Database setup complete${NC}"
}

# Run security tests
run_security_tests() {
    echo -e "${BLUE}Running basic security tests...${NC}"

    # Install security test dependencies
    cd security-tests
    npm install axios 2>/dev/null || echo "Installing axios..."
    npm install axios
    cd ..

    # Run security tests
    node security-tests/security-test-suite.js

    echo -e "${GREEN}✓ Security tests completed${NC}"
}

# Create development scripts
create_dev_scripts() {
    echo -e "${BLUE}Creating development helper scripts...${NC}"

    mkdir -p scripts

    # Create database reset script
    cat > scripts/reset-db.sh << 'EOF'
#!/bin/bash
echo "Resetting development database..."
npx prisma migrate reset --force
npm run prisma:seed
echo "Database reset complete!"
EOF

    # Create logs viewer script
    cat > scripts/view-logs.sh << 'EOF'
#!/bin/bash
echo "Available log commands:"
echo "1. docker-compose logs api     - API logs"
echo "2. docker-compose logs postgres - Database logs"
echo "3. docker-compose logs redis   - Redis logs"
echo "4. docker-compose logs nginx   - Nginx logs"
echo "5. docker-compose logs -f      - Follow all logs"
echo ""
echo "Choose a command or press Enter for all logs:"
read choice

case $choice in
    1) docker-compose logs -f api ;;
    2) docker-compose logs -f postgres ;;
    3) docker-compose logs -f redis ;;
    4) docker-compose logs -f nginx ;;
    5) docker-compose logs -f ;;
    *) docker-compose logs -f ;;
esac
EOF

    # Create test API script
    cat > scripts/test-api.sh << 'EOF'
#!/bin/bash
echo "Testing API endpoints..."

BASE_URL="http://localhost:3000"

echo "1. Health check:"
curl -s "$BASE_URL/health" | jq 2>/dev/null || curl -s "$BASE_URL/health"

echo -e "\n2. Database health check:"
curl -s "$BASE_URL/health/db" | jq 2>/dev/null || curl -s "$BASE_URL/health/db"

echo -e "\n3. Testing protected endpoint (should return 401):"
curl -s "$BASE_URL/api/v1/customers" | jq 2>/dev/null || curl -s "$BASE_URL/api/v1/customers"

echo -e "\nAPI testing complete!"
EOF

    # Make scripts executable
    chmod +x scripts/*.sh

    echo -e "${GREEN}✓ Development scripts created${NC}"
}

# Show development information
show_dev_info() {
    echo ""
    echo -e "${GREEN}=== Development Environment Ready! ===${NC}"
    echo ""
    echo "Services:"
    echo "  🚀 API Server: http://localhost:3000"
    echo "  🗄️  Database: postgresql://postgres:postgres_password@localhost:5432/accounting_db"
    echo "  🔄 Redis: redis://:redis_password@localhost:6379"
    echo "  🌐 Nginx: http://localhost:80"
    echo ""
    echo "Development URLs:"
    echo "  📊 API Health: http://localhost:3000/health"
    echo "  📋 Database Health: http://localhost:3000/health/db"
    echo "  🔍 Prisma Studio: npx prisma studio"
    echo ""
    echo "Useful commands:"
    echo "  🐳 View logs: ./scripts/view-logs.sh"
    echo "  🔄 Reset database: ./scripts/reset-db.sh"
    echo "  🧪 Test API: ./scripts/test-api.sh"
    echo "  🔧 Development server: npm run dev"
    echo "  🧪 Run tests: npm test"
    echo "  🔍 Lint code: npm run lint"
    echo ""
    echo "Docker commands:"
    echo "  📊 Check status: docker-compose ps"
    echo "  🔄 Restart services: docker-compose restart"
    echo "  🛑 Stop services: docker-compose down"
    echo "  📝 View logs: docker-compose logs -f [service]"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Open Prisma Studio: npx prisma studio"
    echo "  2. Test the API: ./scripts/test-api.sh"
    echo "  3. Start coding: npm run dev"
    echo "  4. Run security tests: node security-tests/security-test-suite.js"
}

# Main execution
main() {
    check_prerequisites
    setup_environment
    install_dependencies
    create_directories
    generate_ssl_cert
    start_development_stack
    wait_for_services
    setup_database
    create_dev_scripts
    run_security_tests
    show_dev_info
}

# Cleanup function for interrupted setup
cleanup() {
    echo -e "\n${YELLOW}Setup interrupted. Cleaning up...${NC}"
    docker-compose down 2>/dev/null || true
    exit 1
}

# Trap cleanup function
trap cleanup INT TERM

# Run main function
main "$@"