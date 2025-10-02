# Documentation Index

## Quick Links

- **[API Summary](API_SUMMARY.md)** - Complete API endpoint reference
- **[Architecture](ARCHITECTURE.md)** - System architecture and design patterns
- **[Testing Guide](TESTING_GUIDE.md)** - Test execution and development
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment instructions

## Getting Started

1. **Installation**: See [README.md](../README.md) in root directory
2. **API Documentation**: [API Summary](API_SUMMARY.md) for all 143 endpoints
3. **Development**: Review [Architecture](ARCHITECTURE.md) for system design
4. **Testing**: Follow [Testing Guide](TESTING_GUIDE.md) for running tests

## API Documentation

### Interactive Documentation
- **Swagger UI**: http://localhost:3000/api-docs (when running)
- **OpenAPI Spec**: [openapi.yaml](openapi.yaml)
- **JSDoc Spec**: [jsdoc-openapi.yaml](jsdoc-openapi.yaml)

### Static Documentation
- **API Summary**: [API_SUMMARY.md](API_SUMMARY.md) - All endpoints documented
- **Schemas**: See `openapi.yaml` components/schemas section
- **Examples**: See route files in `src/routes/` with JSDoc comments

## Architecture Documentation

### System Design
- **[Architecture Overview](ARCHITECTURE.md)** - High-level system design
- **Multi-Tenant**: Organization-based data isolation
- **Security**: Bank-level security architecture
- **Database**: 3rd Normal Form compliance

### Code Structure
```
src/
├── routes/        # API route definitions
├── controllers/   # Request handlers
├── services/      # Business logic
├── middleware/    # Authentication, validation, etc.
├── types/         # TypeScript type definitions
├── utils/         # Helper functions
└── config/        # Configuration files
```

## Testing Documentation

- **[Testing Guide](TESTING_GUIDE.md)** - Comprehensive testing information
- **Unit Tests**: 1,102/1,392 passing (79.1%)
- **Integration Tests**: 29 test suites
- **Coverage**: 80%+ unit, 85%+ integration

## Deployment Documentation

- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment
- **Environment Setup**: Configuration requirements
- **Docker**: Containerized deployment
- **Monitoring**: Health checks and logging

## Development Guides

### For New Developers
1. Read [README.md](../README.md) for project overview
2. Review [Architecture](ARCHITECTURE.md) to understand system design
3. Check [Testing Guide](TESTING_GUIDE.md) for running tests
4. Explore [API Summary](API_SUMMARY.md) to understand endpoints

### For API Consumers
1. Start with [API Summary](API_SUMMARY.md) for endpoint reference
2. View Swagger UI at http://localhost:3000/api-docs
3. Review authentication section for JWT setup
4. Check rate limiting and error handling sections

### For DevOps
1. Review [Deployment Guide](DEPLOYMENT.md)
2. Check environment variable requirements
3. Setup database migrations
4. Configure monitoring and logging

## Technical Specifications

### API Specifications
- **Protocol**: REST over HTTPS
- **Format**: JSON request/response
- **Authentication**: JWT Bearer tokens
- **Versioning**: URL-based (/api/v1/)
- **Rate Limiting**: 1000 req/hour per organization

### Database
- **Production**: PostgreSQL 14+
- **Development**: SQLite
- **ORM**: Prisma 5.x
- **Migrations**: Version controlled
- **Normalization**: 3rd Normal Form (3NF)

### Security Features
- JWT authentication with refresh tokens
- Field-level AES-256-GCM encryption
- Organization-specific encryption keys
- Comprehensive audit logging
- Role-based access control (RBAC)
- Multi-factor authentication support

## Additional Resources

### Project Files
- **Main README**: [../README.md](../README.md)
- **CLAUDE.md**: [../CLAUDE.md](../CLAUDE.md) - AI development guide
- **Package.json**: [../package.json](../package.json) - Dependencies and scripts

### External Links
- **Prisma Docs**: https://www.prisma.io/docs
- **Express.js**: https://expressjs.com
- **TypeScript**: https://www.typescriptlang.org
- **Jest**: https://jestjs.io

## Version History

- **1.0.0** (2025-10-01) - Initial release
  - 143 API endpoints
  - Complete accounting functionality
  - Multi-tenant architecture
  - Canadian tax compliance

## Support

For issues and questions:
- **GitHub Issues**: Create an issue in the repository
- **Email**: api-support@lifestreamdynamics.com
- **Documentation**: Review this index and linked guides

---

**Last Updated**: 2025-10-01  
**Documentation Version**: 1.0
