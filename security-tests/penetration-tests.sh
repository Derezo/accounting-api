#!/bin/bash

# Penetration Testing Script for Accounting API
# Bank-level security validation

set -e

API_URL=${1:-"http://localhost:3000"}
REPORT_DIR="./security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create report directory
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}=== Accounting API Penetration Testing Suite ===${NC}"
echo "Target: $API_URL"
echo "Timestamp: $TIMESTAMP"
echo ""

# Function to check if API is running
check_api_health() {
    echo -e "${BLUE}[1/10] Checking API health...${NC}"

    response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || echo "000")

    if [ "$response" -eq 200 ]; then
        echo -e "${GREEN}✓ API is running and accessible${NC}"
    else
        echo -e "${RED}✗ API is not accessible (HTTP $response)${NC}"
        exit 1
    fi
}

# Test for information disclosure
test_information_disclosure() {
    echo -e "${BLUE}[2/10] Testing information disclosure...${NC}"

    # Test server headers
    echo "Testing server headers..."
    headers=$(curl -s -I "$API_URL/health")

    if echo "$headers" | grep -i "server:" | grep -v "nginx"; then
        echo -e "${RED}✗ Server information disclosed${NC}"
    else
        echo -e "${GREEN}✓ Server information properly hidden${NC}"
    fi

    # Test for stack traces in errors
    echo "Testing error handling..."
    error_response=$(curl -s "$API_URL/api/v1/nonexistent")

    if echo "$error_response" | grep -i "stack\|trace\|error.*line"; then
        echo -e "${RED}✗ Stack traces exposed in errors${NC}"
    else
        echo -e "${GREEN}✓ Error handling secure${NC}"
    fi
}

# Test authentication mechanisms
test_authentication() {
    echo -e "${BLUE}[3/10] Testing authentication mechanisms...${NC}"

    # Test JWT token handling
    echo "Testing JWT token validation..."

    # Invalid tokens
    invalid_tokens=(
        "invalid_token"
        "Bearer"
        "Bearer "
        "Bearer fake.token.here"
        "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ."
    )

    for token in "${invalid_tokens[@]}"; do
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: $token" \
            "$API_URL/api/v1/customers")

        if [ "$response" -eq 401 ]; then
            echo -e "${GREEN}✓ Invalid token rejected: $token${NC}"
        else
            echo -e "${RED}✗ Invalid token accepted: $token (HTTP $response)${NC}"
        fi
    done
}

# Test authorization and RBAC
test_authorization() {
    echo -e "${BLUE}[4/10] Testing authorization and RBAC...${NC}"

    # This would require setting up test users with different roles
    # For now, we'll test unauthorized access

    protected_endpoints=(
        "/api/v1/organizations"
        "/api/v1/customers"
        "/api/v1/quotes"
        "/api/v1/invoices"
        "/api/v1/payments"
        "/api/v1/projects"
    )

    for endpoint in "${protected_endpoints[@]}"; do
        response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint")

        if [ "$response" -eq 401 ]; then
            echo -e "${GREEN}✓ Unauthorized access blocked: $endpoint${NC}"
        else
            echo -e "${RED}✗ Unauthorized access allowed: $endpoint (HTTP $response)${NC}"
        fi
    done
}

# Test input validation and injection attacks
test_input_validation() {
    echo -e "${BLUE}[5/10] Testing input validation...${NC}"

    # SQL injection payloads
    sql_payloads=(
        "' OR '1'='1"
        "'; DROP TABLE users; --"
        "' UNION SELECT * FROM users --"
        "admin'--"
        "admin'/*"
    )

    echo "Testing SQL injection protection..."
    for payload in "${sql_payloads[@]}"; do
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            "$API_URL/api/v1/customers?search=$(echo "$payload" | sed 's/ /%20/g')")

        if [ "$response" -ne 500 ]; then
            echo -e "${GREEN}✓ SQL injection blocked: $payload${NC}"
        else
            echo -e "${RED}✗ Potential SQL injection: $payload${NC}"
        fi
    done

    # XSS payloads
    echo "Testing XSS protection..."
    xss_payloads=(
        "<script>alert('xss')</script>"
        "<img src=x onerror=alert('xss')>"
        "javascript:alert('xss')"
        "<svg onload=alert('xss')>"
    )

    for payload in "${xss_payloads[@]}"; do
        # This would require authentication, so we'll just test the endpoint exists
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -d "{\"name\":\"$payload\"}" \
            "$API_URL/api/v1/customers")

        if [ "$response" -eq 401 ]; then
            echo -e "${GREEN}✓ XSS test endpoint properly protected${NC}"
        else
            echo -e "${YELLOW}! XSS test needs authentication: $payload${NC}"
        fi
    done
}

# Test rate limiting
test_rate_limiting() {
    echo -e "${BLUE}[6/10] Testing rate limiting...${NC}"

    echo "Sending rapid requests to test rate limiting..."

    rate_limit_hit=false
    for i in {1..25}; do
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -d '{"email":"test@example.com","password":"wrongpassword"}' \
            "$API_URL/api/v1/auth/login")

        if [ "$response" -eq 429 ]; then
            echo -e "${GREEN}✓ Rate limit triggered after $i requests${NC}"
            rate_limit_hit=true
            break
        fi

        sleep 0.1
    done

    if [ "$rate_limit_hit" = false ]; then
        echo -e "${RED}✗ Rate limiting not working${NC}"
    fi
}

# Test HTTPS and SSL/TLS configuration
test_ssl_tls() {
    echo -e "${BLUE}[7/10] Testing SSL/TLS configuration...${NC}"

    # Check if HTTPS is available
    https_url=$(echo "$API_URL" | sed 's/http:/https:/')

    if command -v openssl &> /dev/null && echo "$https_url" | grep -q "https"; then
        echo "Testing SSL/TLS configuration..."

        # Test SSL certificate
        ssl_info=$(openssl s_client -connect "$(echo "$https_url" | sed 's/https:\/\///' | sed 's/\/.*//')":443 -servername "$(echo "$https_url" | sed 's/https:\/\///' | sed 's/\/.*//')" </dev/null 2>/dev/null | openssl x509 -noout -text 2>/dev/null)

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ SSL certificate valid${NC}"

            # Check for weak ciphers
            weak_ciphers=$(openssl s_client -connect "$(echo "$https_url" | sed 's/https:\/\///' | sed 's/\/.*//')":443 -cipher 'DES:RC4:MD5' </dev/null 2>&1 | grep -c "Cipher is")

            if [ "$weak_ciphers" -eq 0 ]; then
                echo -e "${GREEN}✓ No weak ciphers detected${NC}"
            else
                echo -e "${RED}✗ Weak ciphers detected${NC}"
            fi
        else
            echo -e "${YELLOW}! SSL certificate check failed${NC}"
        fi
    else
        echo -e "${YELLOW}! HTTPS not available or OpenSSL not installed${NC}"
    fi
}

# Test CORS policy
test_cors() {
    echo -e "${BLUE}[8/10] Testing CORS policy...${NC}"

    # Test with various origins
    malicious_origins=(
        "http://evil.com"
        "https://attacker.org"
        "http://malicious.local"
    )

    for origin in "${malicious_origins[@]}"; do
        cors_response=$(curl -s -H "Origin: $origin" -I "$API_URL/api/v1/customers" | grep -i "access-control-allow-origin")

        if echo "$cors_response" | grep -q "$origin"; then
            echo -e "${RED}✗ CORS policy too permissive for: $origin${NC}"
        else
            echo -e "${GREEN}✓ CORS policy blocks: $origin${NC}"
        fi
    done
}

# Test security headers
test_security_headers() {
    echo -e "${BLUE}[9/10] Testing security headers...${NC}"

    headers=$(curl -s -I "$API_URL/health")

    # Required security headers
    required_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
        "X-XSS-Protection"
        "Strict-Transport-Security"
        "Content-Security-Policy"
    )

    for header in "${required_headers[@]}"; do
        if echo "$headers" | grep -qi "$header"; then
            echo -e "${GREEN}✓ Security header present: $header${NC}"
        else
            echo -e "${RED}✗ Missing security header: $header${NC}"
        fi
    done

    # Check for information disclosure headers
    if echo "$headers" | grep -qi "X-Powered-By"; then
        echo -e "${RED}✗ X-Powered-By header exposes technology stack${NC}"
    else
        echo -e "${GREEN}✓ X-Powered-By header not present${NC}"
    fi
}

# Generate vulnerability report
generate_report() {
    echo -e "${BLUE}[10/10] Generating vulnerability report...${NC}"

    report_file="$REPORT_DIR/penetration_test_$TIMESTAMP.txt"

    cat > "$report_file" << EOF
=== Accounting API Penetration Test Report ===
Target: $API_URL
Timestamp: $TIMESTAMP
Test Duration: $(date)

=== Executive Summary ===
This penetration test was conducted to evaluate the security posture
of the Accounting API against common web application vulnerabilities
and attack vectors.

=== Test Results ===
Detailed results have been output to the console during test execution.

=== Recommendations ===
1. Ensure all endpoints require proper authentication
2. Implement comprehensive input validation
3. Configure robust rate limiting
4. Deploy with HTTPS and strong SSL/TLS configuration
5. Set all required security headers
6. Implement proper CORS policies
7. Regular security testing and code reviews

=== Compliance Notes ===
For bank-level security compliance, ensure:
- PCI DSS requirements are met for payment processing
- SOX compliance for financial data
- GDPR/privacy law compliance for customer data
- Regular penetration testing (quarterly recommended)
- Incident response procedures in place

=== Next Steps ===
1. Address any identified vulnerabilities
2. Implement additional monitoring and logging
3. Conduct code review for security best practices
4. Schedule regular security assessments
EOF

    echo -e "${GREEN}Report generated: $report_file${NC}"
}

# Main execution
main() {
    check_api_health
    test_information_disclosure
    test_authentication
    test_authorization
    test_input_validation
    test_rate_limiting
    test_ssl_tls
    test_cors
    test_security_headers
    generate_report

    echo ""
    echo -e "${GREEN}=== Penetration testing completed ===${NC}"
    echo "Review the generated report and address any identified issues."
}

# Run main function
main