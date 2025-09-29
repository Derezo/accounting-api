# Financial Technology Subagents

This directory contains sophisticated subagents specifically engineered for the Lifestream Dynamics Universal Accounting API. These subagents are designed to expand our existing system without compromising the integrity of our API v1 while ensuring adherence to financial technology principles for an international audience.

## Available Subagents

### 1. Financial User Role Specialist (`financial-user-role-specialist`)
**Purpose**: Expert in sophisticated multi-tenant role-based access control, international financial compliance, and workflow permissions testing.

**Key Capabilities**:
- Multi-tenant role hierarchy design and testing
- 8-stage customer lifecycle workflow permissions
- Double-entry bookkeeping role-based access control
- International financial compliance (Canadian tax, GAAP/IFRS, PCI DSS)
- API v1 backwards compatibility validation
- Payment processing security and permissions

**Use Cases**:
- Design and test complex user role hierarchies
- Validate multi-tenant data isolation
- Test workflow automation and approval processes
- Ensure international regulatory compliance
- Validate API backwards compatibility

### 2. Financial Security Compliance Auditor (`financial-security-compliance-auditor`)
**Purpose**: Expert in comprehensive multi-tenant financial system audits, international regulatory compliance, and risk management.

**Key Capabilities**:
- PCI DSS Level 1 compliance assessment
- SOX financial controls validation
- GAAP/IFRS compliance verification
- Canadian tax regulation compliance (CRA, GST/HST/PST/QST)
- Multi-tenant security architecture auditing
- Financial data integrity and audit trail validation

**Use Cases**:
- Conduct comprehensive security audits
- Validate financial regulatory compliance
- Assess multi-tenant security controls
- Review audit trail integrity
- Ensure international data sovereignty compliance

## Integration with Project Architecture

### Documentation Access
Both subagents have full access to our comprehensive project documentation:
- `CLAUDE.md`: Project overview and development patterns
- `API_SPECIFICATION.md`: Complete API endpoint documentation
- `SECURITY_ARCHITECTURE.md`: Security control implementations
- `FINANCIAL_CORE.md`: Double-entry bookkeeping and financial rules
- `INTEGRATION_ARCHITECTURE.md`: Third-party service integrations
- `DEPLOYMENT_OPERATIONS.md`: Production security and deployment controls

### Tool Capabilities
Each subagent is equipped with comprehensive tool access:
- **File Operations**: Read, Write, MultiEdit, Edit for code and test creation
- **Search & Analysis**: Grep, Glob for codebase analysis
- **Project Management**: Task, TodoWrite for progress tracking
- **Research**: WebFetch for accessing external compliance resources

## Usage Examples

### Testing User Role Permissions
```bash
# Use the Financial User Role Specialist to create comprehensive role tests
Task financial-user-role-specialist "Create comprehensive tests for the ACCOUNTANT role accessing financial statements endpoints, ensuring proper multi-tenant isolation and Canadian tax compliance"
```

### Security Compliance Audit
```bash
# Use the Financial Security Compliance Auditor for security assessment
Task financial-security-compliance-auditor "Conduct a comprehensive PCI DSS compliance audit of our payment processing endpoints and provide remediation recommendations"
```

### International Compliance Validation
```bash
# Combined approach for international compliance
Task financial-user-role-specialist "Design role-based access controls for international users complying with Canadian PIPEDA and EU GDPR requirements"
Task financial-security-compliance-auditor "Audit data residency and cross-border financial transaction compliance for our multi-tenant architecture"
```

## Financial Technology Principles

### Multi-Tenant Architecture
- **Organization-level data isolation**: Every query must filter by organizationId
- **Encryption key isolation**: Organization-specific encryption schemes
- **Audit trail segregation**: Immutable logs per organization
- **Role inheritance**: Hierarchical permission models

### International Compliance
- **Canadian Tax Compliance**: GST/HST/PST/QST calculations and reporting
- **GAAP/IFRS Standards**: Financial reporting compliance
- **Data Sovereignty**: Regional data residency requirements
- **Cross-Border Regulations**: International transaction compliance

### API v1 Backwards Compatibility
- **Legacy URL Support**: Maintain existing `/api/v1/resource` patterns
- **New Multi-Tenant URLs**: Support `/api/v1/organizations/{orgId}/resource`
- **Response Format Consistency**: Preserve v1 response structures
- **Permission Model Migration**: Gradual role transition support

### Financial Data Integrity
- **Double-Entry Validation**: Assets = Liabilities + Equity enforcement
- **Transaction Immutability**: Prevention of financial record tampering
- **Audit Trail Completeness**: 100% financial activity logging
- **Regulatory Reporting**: Automated compliance report generation

## Success Metrics

### Security & Compliance
- 100% endpoint authorization coverage
- Zero cross-tenant data leakage incidents
- Full PCI DSS Level 1 compliance
- Complete SOX financial controls validation
- 100% Canadian tax regulation compliance

### Performance & Reliability
- <50ms permission check latency
- 99.99% API availability
- 100% backwards compatibility maintenance
- Zero financial data integrity violations

### International Coverage
- Multi-jurisdictional tax compliance
- GDPR/PIPEDA data protection compliance
- Cross-border transaction validation
- Regional data residency adherence

## Getting Started

1. **Choose the appropriate subagent** based on your specific needs:
   - User roles and permissions → `financial-user-role-specialist`
   - Security and compliance → `financial-security-compliance-auditor`

2. **Provide detailed context** about your requirements, including:
   - Specific user roles or security areas to focus on
   - Regulatory requirements (jurisdiction-specific)
   - Integration points with existing systems
   - Performance and scalability requirements

3. **Collaborate with multiple subagents** for comprehensive coverage:
   - Use both subagents together for complete role-based security testing
   - Combine with general-purpose agents for implementation support
   - Leverage business analyst patterns for workflow requirements

These subagents represent the cutting edge of financial technology expertise, specifically tailored to our accounting API's sophisticated multi-tenant architecture and international compliance requirements.