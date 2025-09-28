#!/bin/bash

# Integration Test Runner Script
# Provides different modes for running integration tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="local"
SUITE="all"
CLEANUP=true
PARALLEL=false
VERBOSE=false
COVERAGE=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_help() {
    cat << EOF
Integration Test Runner

Usage: $0 [OPTIONS]

OPTIONS:
    -m, --mode MODE          Test mode: local, docker, ci (default: local)
    -s, --suite SUITE        Test suite: all, lifecycle, auth, payments, security, performance (default: all)
    -c, --coverage           Generate coverage report
    -p, --parallel           Run tests in parallel (local mode only)
    -v, --verbose            Verbose output
    -n, --no-cleanup         Skip cleanup after tests
    -h, --help               Show this help message

MODES:
    local     - Run tests against local database
    docker    - Run tests in Docker containers
    ci        - CI/CD optimized run

SUITES:
    all           - Run all integration tests
    lifecycle     - Customer lifecycle tests
    auth          - Authentication and authorization tests
    payments      - Payment processing tests
    security      - Security and performance tests
    isolation     - Multi-tenant isolation tests
    integrity     - Data integrity tests
    recovery      - Error handling and recovery tests

EXAMPLES:
    $0 -m local -s lifecycle -c
    $0 -m docker -s all --verbose
    $0 -m ci --coverage --no-cleanup

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -s|--suite)
            SUITE="$2"
            shift 2
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -p|--parallel)
            PARALLEL=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -n|--no-cleanup)
            CLEANUP=false
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate mode
if [[ ! "$MODE" =~ ^(local|docker|ci)$ ]]; then
    print_error "Invalid mode: $MODE"
    exit 1
fi

# Validate suite
if [[ ! "$SUITE" =~ ^(all|lifecycle|auth|payments|security|isolation|integrity|recovery)$ ]]; then
    print_error "Invalid suite: $SUITE"
    exit 1
fi

print_status "Starting integration tests..."
print_status "Mode: $MODE"
print_status "Suite: $SUITE"
print_status "Coverage: $COVERAGE"
print_status "Cleanup: $CLEANUP"

# Set test pattern based on suite
case $SUITE in
    all)
        TEST_PATTERN=""
        ;;
    lifecycle)
        TEST_PATTERN="--testPathPattern=customer-lifecycle"
        ;;
    auth)
        TEST_PATTERN="--testPathPattern=auth-authorization"
        ;;
    payments)
        TEST_PATTERN="--testPathPattern=payment-integration"
        ;;
    security)
        TEST_PATTERN="--testPathPattern=performance-security"
        ;;
    isolation)
        TEST_PATTERN="--testPathPattern=multi-tenant-isolation"
        ;;
    integrity)
        TEST_PATTERN="--testPathPattern=data-integrity"
        ;;
    recovery)
        TEST_PATTERN="--testPathPattern=error-handling-recovery"
        ;;
esac

# Set environment variables
export NODE_ENV=test
export CI=true

if [ "$VERBOSE" = true ]; then
    export DEBUG=true
fi

# Function to cleanup
cleanup() {
    if [ "$CLEANUP" = true ]; then
        print_status "Cleaning up..."

        case $MODE in
            local)
                # Remove test database files
                rm -f test.db test.db-shm test.db-wal
                rm -f test-integration.db test-integration.db-shm test-integration.db-wal
                ;;
            docker)
                # Stop and remove Docker containers
                docker-compose -f docker-compose.test.yml down -v
                ;;
        esac

        print_success "Cleanup completed"
    fi
}

# Trap cleanup on exit
trap cleanup EXIT

# Function to run local tests
run_local_tests() {
    print_status "Running tests in local mode..."

    # Check if Node.js and npm are available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm ci
    fi

    # Generate Prisma client
    print_status "Generating Prisma client..."
    npx prisma generate

    # Set up test database
    export TEST_DATABASE_URL="file:./test-integration.db"
    export DATABASE_URL="$TEST_DATABASE_URL"

    print_status "Setting up test database..."
    npx prisma db push --force-reset

    # Build test command
    TEST_CMD="npm run test:integration"

    if [ "$COVERAGE" = true ]; then
        TEST_CMD="npm run test:integration:coverage"
    fi

    if [ "$PARALLEL" = true ] && [ "$MODE" = "local" ]; then
        TEST_CMD="$TEST_CMD -- --maxWorkers=50%"
    fi

    if [ -n "$TEST_PATTERN" ]; then
        TEST_CMD="$TEST_CMD -- $TEST_PATTERN"
    fi

    if [ "$VERBOSE" = true ]; then
        TEST_CMD="$TEST_CMD -- --verbose"
    fi

    print_status "Running command: $TEST_CMD"
    eval $TEST_CMD
}

# Function to run Docker tests
run_docker_tests() {
    print_status "Running tests in Docker mode..."

    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi

    # Build and run tests
    print_status "Building test containers..."
    docker-compose -f docker-compose.test.yml build test-runner

    # Set environment variables for Docker
    export TEST_PATTERN_ENV="$TEST_PATTERN"
    export COVERAGE_ENV="$COVERAGE"
    export VERBOSE_ENV="$VERBOSE"

    print_status "Running tests in containers..."

    if [ "$SUITE" = "security" ]; then
        docker-compose -f docker-compose.test.yml run --rm security-tester
    elif [ "$SUITE" = "performance" ] || [[ "$TEST_PATTERN" == *"performance"* ]]; then
        docker-compose -f docker-compose.test.yml run --rm performance-tester
    else
        docker-compose -f docker-compose.test.yml run --rm test-runner
    fi
}

# Function to run CI tests
run_ci_tests() {
    print_status "Running tests in CI mode..."

    # Set CI-specific environment variables
    export CI=true
    export NODE_ENV=test
    export TEST_TIMEOUT=300000  # 5 minutes

    # Use SQLite for CI to avoid external dependencies
    export TEST_DATABASE_URL="file:./test-ci.db"
    export DATABASE_URL="$TEST_DATABASE_URL"

    # Install dependencies
    print_status "Installing dependencies..."
    npm ci

    # Generate Prisma client
    print_status "Generating Prisma client..."
    npx prisma generate

    # Set up test database
    print_status "Setting up test database..."
    npx prisma db push --force-reset

    # Build test command for CI
    TEST_CMD="npm run test:integration"

    if [ "$COVERAGE" = true ]; then
        TEST_CMD="npm run test:integration:coverage"
    fi

    # Always use single worker in CI for stability
    TEST_CMD="$TEST_CMD -- --maxWorkers=1 --detectOpenHandles --forceExit"

    if [ -n "$TEST_PATTERN" ]; then
        TEST_CMD="$TEST_CMD $TEST_PATTERN"
    fi

    print_status "Running command: $TEST_CMD"
    eval $TEST_CMD
}

# Main execution
print_status "Environment setup completed"

case $MODE in
    local)
        run_local_tests
        ;;
    docker)
        run_docker_tests
        ;;
    ci)
        run_ci_tests
        ;;
esac

print_success "Integration tests completed successfully!"

# Display results summary
if [ "$COVERAGE" = true ]; then
    print_status "Coverage reports generated:"
    if [ "$MODE" = "local" ]; then
        echo "  - HTML: coverage/integration/lcov-report/index.html"
        echo "  - LCOV: coverage/integration/lcov.info"
    fi
fi

if [ -d "test-results" ]; then
    print_status "Test results available in: test-results/"
fi

exit 0