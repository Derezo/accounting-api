#!/bin/bash

# Script to fix template literal syntax in test files
# Converts single quotes to backticks when ${organizationId} is present

echo "🔧 Fixing template literal syntax..."
echo ""

# Find all test files in integration directory
TEST_FILES=$(find tests/integration -name "*.test.ts" -type f)

FIXED_COUNT=0

for file in $TEST_FILES; do
    if grep -q "('\(/\)*api.*\${" "$file" 2>/dev/null; then
        echo "Processing: $(basename $file)"

        # Fix patterns like .get('/api/v1/organizations/${organizationId}/customers')
        # to .get(`/api/v1/organizations/${organizationId}/customers`)

        # Use perl for better regex support
        perl -i -pe "s/\.get\('(\/api\/[^']*\\\$\{[^}]+\}[^']*)'\)/.get(\`\1\`)/g" "$file"
        perl -i -pe "s/\.post\('(\/api\/[^']*\\\$\{[^}]+\}[^']*)'\)/.post(\`\1\`)/g" "$file"
        perl -i -pe "s/\.put\('(\/api\/[^']*\\\$\{[^}]+\}[^']*)'\)/.put(\`\1\`)/g" "$file"
        perl -i -pe "s/\.patch\('(\/api\/[^']*\\\$\{[^}]+\}[^']*)'\)/.patch(\`\1\`)/g" "$file"
        perl -i -pe "s/\.delete\('(\/api\/[^']*\\\$\{[^}]+\}[^']*)'\)/.delete(\`\1\`)/g" "$file"

        ((FIXED_COUNT++))
        echo "  ✓ Fixed template literals"
    fi
done

echo ""
echo "================================================"
echo "✅ Template Literal Fix Complete!"
echo "================================================"
echo "Files modified: $FIXED_COUNT"
echo ""
