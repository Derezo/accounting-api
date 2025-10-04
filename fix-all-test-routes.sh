#!/bin/bash

# Script to fix all route mismatches in integration tests
# Converts old routes to new multi-tenant structure with organizationId

echo "🔧 Fixing integration test routes..."
echo ""

# Backup directory
BACKUP_DIR="tests/integration/backups-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Find all test files
TEST_FILES=$(find tests/integration -name "*.test.ts" -type f)

FIXED_COUNT=0
ROUTE_FIXES=0

for file in $TEST_FILES; do
    echo "Processing: $(basename $file)"

    # Create backup
    cp "$file" "$BACKUP_DIR/$(basename $file)"

    # Counter for this file
    FILE_CHANGES=0

    # Fix common routes - /api/customers -> /api/v1/organizations/${organizationId}/customers
    if grep -q "'/api/customers" "$file" 2>/dev/null; then
        sed -i "s|'/api/customers|'/api/v1/organizations/\${organizationId}/customers|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/quotes" "$file" 2>/dev/null; then
        sed -i "s|'/api/quotes|'/api/v1/organizations/\${organizationId}/quotes|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/appointments" "$file" 2>/dev/null; then
        sed -i "s|'/api/appointments|'/api/v1/organizations/\${organizationId}/appointments|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/invoices" "$file" 2>/dev/null; then
        sed -i "s|'/api/invoices|'/api/v1/organizations/\${organizationId}/invoices|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/payments" "$file" 2>/dev/null; then
        sed -i "s|'/api/payments|'/api/v1/organizations/\${organizationId}/payments|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/projects" "$file" 2>/dev/null; then
        sed -i "s|'/api/projects|'/api/v1/organizations/\${organizationId}/projects|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/users" "$file" 2>/dev/null; then
        sed -i "s|'/api/users|'/api/v1/organizations/\${organizationId}/users|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/audit" "$file" 2>/dev/null; then
        sed -i "s|'/api/audit|'/api/v1/organizations/\${organizationId}/audit|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/vendors" "$file" 2>/dev/null; then
        sed -i "s|'/api/vendors|'/api/v1/organizations/\${organizationId}/vendors|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/bills" "$file" 2>/dev/null; then
        sed -i "s|'/api/bills|'/api/v1/organizations/\${organizationId}/bills|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/purchase-orders" "$file" 2>/dev/null; then
        sed -i "s|'/api/purchase-orders|'/api/v1/organizations/\${organizationId}/purchase-orders|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/inventory" "$file" 2>/dev/null; then
        sed -i "s|'/api/inventory|'/api/v1/organizations/\${organizationId}/inventory|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/accounting" "$file" 2>/dev/null; then
        sed -i "s|'/api/accounting|'/api/v1/organizations/\${organizationId}/accounting|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/financial-statements" "$file" 2>/dev/null; then
        sed -i "s|'/api/financial-statements|'/api/v1/organizations/\${organizationId}/financial-statements|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/tax" "$file" 2>/dev/null; then
        sed -i "s|'/api/tax|'/api/v1/organizations/\${organizationId}/tax|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/etransfers" "$file" 2>/dev/null; then
        sed -i "s|'/api/etransfers|'/api/v1/organizations/\${organizationId}/etransfers|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/manual-payments" "$file" 2>/dev/null; then
        sed -i "s|'/api/manual-payments|'/api/v1/organizations/\${organizationId}/manual-payments|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/payment-analytics" "$file" 2>/dev/null; then
        sed -i "s|'/api/payment-analytics|'/api/v1/organizations/\${organizationId}/payment-analytics|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/settings" "$file" 2>/dev/null; then
        sed -i "s|'/api/settings|'/api/v1/organizations/\${organizationId}/settings|g" "$file"
        ((FILE_CHANGES++))
    fi

    if grep -q "'/api/documents" "$file" 2>/dev/null; then
        sed -i "s|'/api/documents|'/api/v1/organizations/\${organizationId}/documents|g" "$file"
        ((FILE_CHANGES++))
    fi

    # Now fix template literals - convert single quotes to backticks where ${organizationId} is used
    # This handles cases we just created above
    if grep -q "'\(.*\)\${organizationId}" "$file" 2>/dev/null; then
        # Replace opening quote
        sed -i "s|'\(/api/v1/organizations/\${organizationId}[^']*\)|`\1`|g" "$file"
        ((FILE_CHANGES++))
    fi

    if [ $FILE_CHANGES -gt 0 ]; then
        ((FIXED_COUNT++))
        ((ROUTE_FIXES+=$FILE_CHANGES))
        echo "  ✓ Fixed $FILE_CHANGES route patterns"
    else
        echo "  - No changes needed"
    fi
done

echo ""
echo "================================================"
echo "✅ Route Fix Complete!"
echo "================================================"
echo "Files processed: $(echo "$TEST_FILES" | wc -l)"
echo "Files modified: $FIXED_COUNT"
echo "Total route fixes: $ROUTE_FIXES"
echo ""
echo "Backups saved to: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Run tests: npm run test:integration"
echo "2. If issues occur, restore from backup"
echo "3. Check test results for remaining failures"
echo ""
