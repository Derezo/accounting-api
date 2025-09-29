#!/bin/bash

# Build and Deployment Test Script
# Tests the optimized build process for all environments

set -e  # Exit on any error

echo "🚀 Testing Build and Deployment Process"
echo "========================================"

# Function to print section headers
print_section() {
    echo ""
    echo "📋 $1"
    echo "----------------------------------------"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Prerequisites check
print_section "Checking Prerequisites"
echo "✓ Checking Node.js version..."
node --version

echo "✓ Checking npm version..."
npm --version

if command_exists docker; then
    echo "✓ Docker is available"
    docker --version
else
    echo "⚠️  Docker not found - Docker deployment tests will be skipped"
fi

# Install dependencies
print_section "Installing Dependencies"
echo "📦 Installing npm dependencies..."
npm ci

# Run validation
print_section "Running Validation"
echo "🔍 Running linting..."
npm run lint

echo "🔍 Running type checking..."
npm run typecheck:prod

# Test different build configurations
print_section "Testing Build Configurations"

echo "🏗️  Testing development build..."
npm run build:dev
echo "✓ Development build successful"

echo "🏗️  Testing production build..."
npm run build:prod
echo "✓ Production build successful"

echo "🏗️  Testing staging build..."
npm run build:staging
echo "✓ Staging build successful"

# Verify build output
print_section "Verifying Build Output"
if [ -d "dist" ]; then
    echo "✓ Build directory exists"
    echo "📁 Build contents:"
    ls -la dist/

    # Check for main files
    if [ -f "dist/index.js" ]; then
        echo "✓ Main application file exists"
    else
        echo "❌ Main application file missing"
        exit 1
    fi
else
    echo "❌ Build directory not found"
    exit 1
fi

# Test application startup
print_section "Testing Application Startup"
echo "🚀 Starting application in background..."

# Set environment for testing
export NODE_ENV=development
export PORT=3001
export DATABASE_URL="file:./test.db"
export JWT_SECRET="test-secret-for-build-testing-only"
export ENCRYPTION_KEY="test-encryption-key-32-chars-long"

# Start the application in background
timeout 30s node dist/index.js &
APP_PID=$!

# Give it time to start
sleep 5

# Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✓ Health endpoint responding"
else
    echo "❌ Health endpoint not responding"
    kill $APP_PID 2>/dev/null || true
    exit 1
fi

# Stop the application
kill $APP_PID 2>/dev/null || true
echo "✓ Application stopped"

# Test Docker builds if Docker is available
if command_exists docker; then
    print_section "Testing Docker Builds"

    echo "🐳 Testing development Docker build..."
    docker build --target development -t accounting-api:dev-test . > /dev/null
    echo "✓ Development Docker build successful"

    echo "🐳 Testing staging Docker build..."
    docker build --target staging -t accounting-api:staging-test . > /dev/null
    echo "✓ Staging Docker build successful"

    echo "🐳 Testing production Docker build..."
    docker build --target production -t accounting-api:prod-test . > /dev/null
    echo "✓ Production Docker build successful"

    # Clean up test images
    docker rmi accounting-api:dev-test accounting-api:staging-test accounting-api:prod-test > /dev/null 2>&1 || true
fi

# Clean up build artifacts
print_section "Cleaning Up"
echo "🧹 Cleaning build artifacts..."
npm run clean
echo "✓ Cleanup complete"

# Final summary
print_section "Build Test Summary"
echo "🎉 All build and deployment tests passed!"
echo ""
echo "📋 Available commands:"
echo "   npm run dev          - Start development server"
echo "   npm run build        - Build for production"
echo "   npm run build:dev    - Build for development"
echo "   npm run build:staging - Build for staging"
echo "   npm run start:prod   - Start production server"
echo "   npm run deploy:staging - Deploy to staging"
echo "   npm run deploy:prod  - Deploy to production"
echo ""
echo "📖 For more information, see docs/BUILD_DEPLOY.md"