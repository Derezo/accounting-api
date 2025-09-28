#!/bin/bash

# Accounting API - cURL Examples
# This script provides comprehensive examples for testing the Accounting API using cURL

# Configuration
BASE_URL="http://localhost:3000/api/v1"
CONTENT_TYPE="application/json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if API is running
check_api() {
    print_header "Checking API Health"

    response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/../health")
    if [ "$response" = "200" ]; then
        print_success "API is running"
    else
        print_error "API is not running or not accessible"
        exit 1
    fi
}

# Authentication Examples
auth_examples() {
    print_header "Authentication Examples"

    # Register new user and organization
    echo -e "\n${YELLOW}1. Register new user and organization:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "password": "SecurePassword123!",
    "phone": "+1 (555) 123-4567",
    "organizationName": "Doe Accounting",
    "organizationType": "SINGLE_BUSINESS"
  }'
EOF

    # Login
    echo -e "\n${YELLOW}2. Login:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!",
    "organizationId": "550e8400-e29b-41d4-a716-446655440000"
  }'
EOF

    echo -e "\n${YELLOW}Save the tokens from login response:${NC}"
    echo 'ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."'
    echo 'REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."'

    # Refresh token
    echo -e "\n${YELLOW}3. Refresh access token:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "$REFRESH_TOKEN"
  }'
EOF

    # Logout
    echo -e "\n${YELLOW}4. Logout:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "$REFRESH_TOKEN"
  }'
EOF
}

# Customer Examples
customer_examples() {
    print_header "Customer Management Examples"

    # Get customers with pagination
    echo -e "\n${YELLOW}1. Get customers with pagination and filtering:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/customers?limit=20&offset=0&sortBy=createdAt&sortOrder=desc&type=PERSON&status=ACTIVE" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    # Create person customer
    echo -e "\n${YELLOW}2. Create person customer:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/customers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PERSON",
    "tier": "PERSONAL",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@example.com",
    "phone": "+1 (555) 987-6543",
    "address": {
      "street": "456 Oak Ave",
      "city": "Vancouver",
      "province": "BC",
      "postalCode": "V6B 1A1",
      "country": "Canada"
    },
    "notes": "Preferred customer with expedited service"
  }'
EOF

    # Create business customer
    echo -e "\n${YELLOW}3. Create business customer:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/customers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "BUSINESS",
    "tier": "SMALL_BUSINESS",
    "companyName": "Tech Solutions Inc",
    "businessType": "CORPORATION",
    "email": "contact@techsolutions.com",
    "phone": "+1 (555) 555-5555",
    "address": {
      "street": "789 Business Blvd",
      "city": "Calgary",
      "province": "AB",
      "postalCode": "T2P 1J9",
      "country": "Canada"
    },
    "taxNumber": "123456789RT0001",
    "notes": "Growing tech company"
  }'
EOF

    # Get specific customer
    echo -e "\n${YELLOW}4. Get specific customer:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/customers/CUSTOMER_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    # Update customer
    echo -e "\n${YELLOW}5. Update customer:${NC}"
    cat << 'EOF'
curl -X PUT "$BASE_URL/customers/CUSTOMER_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1 (555) 111-2222",
    "tier": "ENTERPRISE",
    "notes": "Updated customer information"
  }'
EOF

    # Search customers
    echo -e "\n${YELLOW}6. Search customers:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/customers?search=smith&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF
}

# Quote Examples
quote_examples() {
    print_header "Quote Management Examples"

    # Create quote
    echo -e "\n${YELLOW}1. Create quote:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/quotes" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "items": [
      {
        "description": "Accounting consultation",
        "quantity": "2.00",
        "unitPrice": "150.00"
      },
      {
        "description": "Tax preparation",
        "quantity": "1.00",
        "unitPrice": "300.00"
      }
    ],
    "taxRate": "0.13",
    "validUntil": "2024-01-31T23:59:59.000Z",
    "notes": "Special pricing for new customer",
    "terms": "Payment due within 30 days of acceptance"
  }'
EOF

    # Get quotes
    echo -e "\n${YELLOW}2. Get quotes with filtering:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/quotes?status=DRAFT&customerId=CUSTOMER_ID&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    # Update quote status
    echo -e "\n${YELLOW}3. Update quote status:${NC}"
    cat << 'EOF'
curl -X PATCH "$BASE_URL/quotes/QUOTE_ID/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SENT"
  }'
EOF

    # Accept quote (customer action simulation)
    echo -e "\n${YELLOW}4. Accept quote:${NC}"
    cat << 'EOF'
curl -X PATCH "$BASE_URL/quotes/QUOTE_ID/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ACCEPTED"
  }'
EOF
}

# Invoice Examples
invoice_examples() {
    print_header "Invoice Management Examples"

    # Create invoice
    echo -e "\n${YELLOW}1. Create invoice:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/invoices" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "items": [
      {
        "description": "Consulting Services - December 2023",
        "quantity": "10.00",
        "unitPrice": "100.00"
      }
    ],
    "taxRate": "0.13",
    "depositRequired": "200.00",
    "dueDate": "2024-01-31T23:59:59.000Z",
    "notes": "Payment due within 30 days",
    "terms": "Net 30 payment terms"
  }'
EOF

    # Create invoice from quote
    echo -e "\n${YELLOW}2. Create invoice from accepted quote:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/invoices/from-quote" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "QUOTE_ID",
    "depositRequired": "150.00",
    "dueDate": "2024-02-15T23:59:59.000Z"
  }'
EOF

    # Get invoices
    echo -e "\n${YELLOW}3. Get invoices with filtering:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/invoices?status=SENT&customerId=CUSTOMER_ID&limit=10&sortBy=dueDate&sortOrder=asc" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    # Update invoice
    echo -e "\n${YELLOW}4. Update invoice:${NC}"
    cat << 'EOF'
curl -X PUT "$BASE_URL/invoices/INVOICE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dueDate": "2024-02-28T23:59:59.000Z",
    "notes": "Extended due date per customer request"
  }'
EOF

    # Send invoice
    echo -e "\n${YELLOW}5. Send invoice to customer:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/invoices/INVOICE_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "EMAIL",
    "message": "Please find your invoice attached."
  }'
EOF
}

# Payment Examples
payment_examples() {
    print_header "Payment Processing Examples"

    # Create Stripe payment intent
    echo -e "\n${YELLOW}1. Create Stripe payment intent:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/payments/intent" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "INVOICE_ID",
    "amount": "500.00",
    "method": "STRIPE_CARD"
  }'
EOF

    # Record manual payment
    echo -e "\n${YELLOW}2. Record manual payment (e-transfer):${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/payments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "INVOICE_ID",
    "amount": "200.00",
    "method": "INTERAC_ETRANSFER",
    "reference": "ETR-20231201-001",
    "notes": "E-transfer received from customer"
  }'
EOF

    # Get payments
    echo -e "\n${YELLOW}3. Get payments with filtering:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/payments?status=COMPLETED&customerId=CUSTOMER_ID&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    # Process refund
    echo -e "\n${YELLOW}4. Process refund:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/payments/PAYMENT_ID/refund" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100.00",
    "reason": "Customer requested partial refund"
  }'
EOF
}

# Project Examples
project_examples() {
    print_header "Project Management Examples"

    # Create project
    echo -e "\n${YELLOW}1. Create project:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/projects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "name": "Annual Tax Preparation 2023",
    "description": "Complete tax return preparation for fiscal year 2023",
    "startDate": "2024-01-01T09:00:00.000Z",
    "endDate": "2024-03-31T17:00:00.000Z",
    "estimatedHours": "40.00",
    "hourlyRate": "125.00",
    "budgetAmount": "5000.00",
    "tags": ["tax", "annual", "2023"],
    "notes": "Client prefers email communication",
    "milestones": [
      {
        "title": "Document Collection",
        "description": "Collect all necessary tax documents from client",
        "dueDate": "2024-01-15T17:00:00.000Z"
      },
      {
        "title": "Tax Return Preparation",
        "description": "Prepare complete tax return",
        "dueDate": "2024-03-15T17:00:00.000Z"
      }
    ]
  }'
EOF

    # Add time entry
    echo -e "\n${YELLOW}2. Add time entry to project:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/projects/PROJECT_ID/time-entries" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-10",
    "hours": "3.50",
    "description": "Reviewed client financial statements and identified missing documents",
    "billable": true
  }'
EOF

    # Update project status
    echo -e "\n${YELLOW}3. Update project status:${NC}"
    cat << 'EOF'
curl -X PATCH "$BASE_URL/projects/PROJECT_ID/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "IN_PROGRESS",
    "progress": 25
  }'
EOF

    # Complete milestone
    echo -e "\n${YELLOW}4. Complete project milestone:${NC}"
    cat << 'EOF'
curl -X PATCH "$BASE_URL/projects/PROJECT_ID/milestones/MILESTONE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "completed": true
  }'
EOF
}

# Appointment Examples
appointment_examples() {
    print_header "Appointment Scheduling Examples"

    # Create appointment
    echo -e "\n${YELLOW}1. Create appointment:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/appointments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "title": "Initial Consultation",
    "description": "Discuss accounting needs and project scope",
    "startTime": "2024-01-15T10:00:00.000Z",
    "endTime": "2024-01-15T11:00:00.000Z",
    "location": "Conference Room A",
    "isVirtual": false,
    "reminders": [
      {
        "type": "EMAIL",
        "minutesBefore": 1440
      },
      {
        "type": "EMAIL",
        "minutesBefore": 60
      }
    ],
    "notes": "Bring financial statements for the last 2 years"
  }'
EOF

    # Get appointments
    echo -e "\n${YELLOW}2. Get appointments for date range:${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/appointments?startDate=2024-01-01&endDate=2024-01-31&status=SCHEDULED" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    # Update appointment
    echo -e "\n${YELLOW}3. Reschedule appointment:${NC}"
    cat << 'EOF'
curl -X PUT "$BASE_URL/appointments/APPOINTMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2024-01-16T14:00:00.000Z",
    "endTime": "2024-01-16T15:00:00.000Z",
    "notes": "Rescheduled per customer request"
  }'
EOF

    # Cancel appointment
    echo -e "\n${YELLOW}4. Cancel appointment:${NC}"
    cat << 'EOF'
curl -X PATCH "$BASE_URL/appointments/APPOINTMENT_ID/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CANCELLED"
  }'
EOF
}

# Error Handling Examples
error_examples() {
    print_header "Error Handling Examples"

    echo -e "\n${YELLOW}1. Validation error (400):${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/customers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INVALID_TYPE",
    "email": "invalid-email"
  }'
EOF

    echo -e "\n${YELLOW}2. Authentication error (401):${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/customers" \
  -H "Authorization: Bearer invalid_token"
EOF

    echo -e "\n${YELLOW}3. Not found error (404):${NC}"
    cat << 'EOF'
curl -X GET "$BASE_URL/customers/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
EOF

    echo -e "\n${YELLOW}4. Rate limit error (429):${NC}"
    echo "# Make multiple rapid requests to trigger rate limiting"
    cat << 'EOF'
for i in {1..10}; do
  curl -X GET "$BASE_URL/customers" \
    -H "Authorization: Bearer $ACCESS_TOKEN" &
done
wait
EOF
}

# File Upload Examples
file_examples() {
    print_header "File Upload Examples"

    echo -e "\n${YELLOW}1. Upload customer document:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/customers/CUSTOMER_ID/documents" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "type=TAX_DOCUMENT" \
  -F "description=Tax return for 2023"
EOF

    echo -e "\n${YELLOW}2. Upload project attachment:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/projects/PROJECT_ID/attachments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/spreadsheet.xlsx" \
  -F "description=Financial analysis spreadsheet"
EOF
}

# Webhook Examples
webhook_examples() {
    print_header "Webhook Examples"

    echo -e "\n${YELLOW}1. Register webhook endpoint:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/webhooks" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/accounting",
    "events": ["invoice.paid", "payment.completed", "project.completed"],
    "secret": "your-webhook-secret"
  }'
EOF

    echo -e "\n${YELLOW}2. Test webhook:${NC}"
    cat << 'EOF'
curl -X POST "$BASE_URL/webhooks/WEBHOOK_ID/test" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "invoice.paid"
  }'
EOF
}

# Main execution
main() {
    echo -e "${GREEN}Accounting API - cURL Examples${NC}"
    echo -e "${BLUE}================================${NC}"

    if [ "$1" = "check" ]; then
        check_api
        exit 0
    fi

    if [ "$1" = "all" ] || [ -z "$1" ]; then
        auth_examples
        customer_examples
        quote_examples
        invoice_examples
        payment_examples
        project_examples
        appointment_examples
        error_examples
        file_examples
        webhook_examples
    else
        case "$1" in
            "auth") auth_examples ;;
            "customers") customer_examples ;;
            "quotes") quote_examples ;;
            "invoices") invoice_examples ;;
            "payments") payment_examples ;;
            "projects") project_examples ;;
            "appointments") appointment_examples ;;
            "errors") error_examples ;;
            "files") file_examples ;;
            "webhooks") webhook_examples ;;
            *)
                echo -e "${RED}Unknown command: $1${NC}"
                echo -e "${YELLOW}Available commands: auth, customers, quotes, invoices, payments, projects, appointments, errors, files, webhooks, all, check${NC}"
                exit 1
                ;;
        esac
    fi

    echo -e "\n${GREEN}Examples completed!${NC}"
    echo -e "${BLUE}Remember to replace placeholders like CUSTOMER_ID, ACCESS_TOKEN, etc. with actual values.${NC}"
}

# Run the script
main "$@"