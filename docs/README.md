# Universal Accounting API - Documentation

## Overview

The Universal Accounting API is a comprehensive, bank-level secure REST API backend designed to provide universal accounting, financial, and business management operations for businesses of all sizes. This directory contains complete documentation organized into focused sections for easier navigation and understanding.

## 📁 Directory Structure

```
docs/
├── README.md                    # This file - documentation overview
├── openapi.yaml                 # Main OpenAPI 3.0 specification
├── openapi-extensions.yaml     # Extended endpoint definitions
├── api-docs.html               # Static HTML documentation (generated)
├── authentication.md           # Authentication and security guide
├── CHANGELOG.md                # API version history and changes
└── examples/                   # Client implementation examples
    ├── javascript-client.js    # Node.js/JavaScript client
    ├── python-client.py        # Python client
    ├── curl-examples.sh        # cURL command examples
    └── postman/                # Postman collection and environment
        ├── collection.json     # Postman API collection
        └── environment.json    # Environment variables
```

## 🚀 Quick Start

### 1. View Interactive Documentation

**Development Environment:**
```bash
# Start the API server
npm run dev

# Access Swagger UI at:
http://localhost:3000/api-docs
```

**Production/Standalone Documentation:**
```bash
# Build and serve documentation container
docker-compose up docs

# Access documentation at:
http://localhost:8080
```

### 2. Generate Documentation

```bash
# Generate all documentation files
npm run docs:generate

# Generate TypeScript types only
npm run docs:types

# Build static HTML documentation
npm run docs:build

# Serve documentation with live reload
npm run docs:serve
```

### 3. Validate API Specification

```bash
# Run full documentation generation with validation
npm run docs:generate -- --verbose

# Validate OpenAPI spec only
npm run docs:generate -- --no-types --no-html
```

## 📚 Documentation Features

### Interactive API Explorer
- **Swagger UI**: Full interactive API documentation with request/response examples
- **Try It Out**: Execute API calls directly from the documentation
- **Authentication**: Built-in JWT token management
- **Schema Visualization**: Interactive schema browser with examples

### Comprehensive Coverage
- **All Endpoints**: Complete coverage of authentication, organizations, customers, quotes, appointments, invoices, payments, and projects
- **Request/Response Examples**: Real-world examples for every endpoint
- **Error Documentation**: Detailed error responses with troubleshooting guides
- **Authentication Flows**: Step-by-step authentication implementation guide

### Developer Resources
- **TypeScript Types**: Auto-generated types from OpenAPI specification
- **Client Examples**: Ready-to-use client implementations in multiple languages
- **Code Snippets**: Copy-paste examples for common operations
- **Postman Collection**: Import and test API endpoints immediately

### Security Documentation
- **Authentication Guide**: JWT implementation with refresh tokens
- **Role-Based Access**: Detailed RBAC documentation
- **Rate Limiting**: API limits and best practices
- **Security Best Practices**: Implementation guidelines for secure integration

## 🔧 API Documentation Standards

### OpenAPI 3.0 Specification
Our API documentation follows OpenAPI 3.0 standards with:

- **Comprehensive Schemas**: Detailed type definitions with validation rules
- **Security Schemes**: JWT Bearer token authentication
- **Error Responses**: Standardized error format across all endpoints
- **Examples**: Real-world request/response examples
- **Descriptions**: Detailed operation descriptions with business context

### Documentation Quality Standards

#### ✅ Required Elements
- [ ] Operation summary and description
- [ ] All parameters documented with examples
- [ ] Request body schemas with validation rules
- [ ] Response schemas for all status codes
- [ ] Error response documentation
- [ ] Security requirements specified
- [ ] Examples for complex operations

#### 🎯 Best Practices
- Use business-friendly language in descriptions
- Include common use cases and workflows
- Provide troubleshooting information for errors
- Add deprecation warnings with migration paths
- Include performance considerations for large datasets

## 🛠️ Maintenance

### Updating Documentation

1. **Modify OpenAPI Specification**
   ```bash
   # Edit the main specification
   vim docs/openapi.yaml

   # Validate changes
   npm run docs:generate -- --verbose
   ```

2. **Add New Endpoints**
   ```bash
   # Add endpoint definitions to openapi-extensions.yaml
   # or directly to openapi.yaml for core endpoints

   # Generate updated TypeScript types
   npm run docs:types
   ```

3. **Update Examples**
   ```bash
   # Edit client examples in docs/examples/
   # Update Postman collection with new endpoints
   # Test examples against running API
   ```

### Version Management

When releasing API changes:

1. **Update Version Numbers**
   - OpenAPI specification version
   - Package.json version
   - Changelog entries

2. **Generate Documentation**
   ```bash
   npm run docs:generate
   npm run docs:build
   ```

3. **Deploy Documentation**
   ```bash
   docker-compose up -d docs
   ```

### Automated Validation

Our CI/CD pipeline automatically:
- Validates OpenAPI specification syntax
- Generates TypeScript types and checks for compilation errors
- Builds static documentation
- Tests client examples against the API
- Deploys documentation to staging environment

## 🌐 Deployment

### Development Environment
```bash
# Integrated with API server
npm run dev
# Documentation available at http://localhost:3000/api-docs
```

### Docker Deployment
```bash
# Build documentation container
docker build -f docker/docs.Dockerfile -t accounting-docs .

# Run standalone documentation server
docker run -p 8080:80 accounting-docs
# Documentation available at http://localhost:8080
```

### Production Deployment
```bash
# Use Docker Compose for complete setup
docker-compose -f docker-compose.production.yml up -d docs

# Or deploy to cloud platforms
# Documentation container is cloud-ready with proper health checks
```

## 🔍 API Reference

### Base URLs
- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://api.accounting.com/api/v1`

### Authentication
```http
Authorization: Bearer <jwt-token>
```

### Rate Limits
- **Authentication endpoints**: 5 requests/minute
- **General endpoints**: 100 requests/minute
- **File uploads**: 10 requests/minute

### Supported Formats
- **Request**: JSON (`application/json`)
- **Response**: JSON (`application/json`)
- **File uploads**: Multipart form data (`multipart/form-data`)

## 📞 Support

### Documentation Issues
- **GitHub Issues**: Report documentation bugs or request improvements
- **Email**: dev-support@lifestreamdynamics.com
- **Slack**: #api-documentation channel

### API Support
- **Technical Support**: support@lifestreamdynamics.com
- **Developer Portal**: https://developers.accounting.com
- **Status Page**: https://status.accounting.com

## 🔗 Related Resources

- [API Authentication Guide](./authentication.md)
- [Changelog](./CHANGELOG.md)
- [Client Examples](./examples/)
- [Postman Collection](./examples/postman/)
- [Main Project README](../README.md)

---

## 📝 License

This documentation is part of the Accounting API project and is subject to the same licensing terms. See the main project license for details.

**Generated on**: $(date)
**API Version**: 1.0.0
**Documentation Version**: 1.0.0