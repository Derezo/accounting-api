#!/bin/bash

# Script to fix template literal syntax errors in integration tests
# Replaces single quotes with backticks in API route strings that contain ${

echo "Fixing template literal syntax in integration tests..."

# Find all test files
TEST_FILES=$(find tests/integration -name "*.test.ts" -type f)

FIXED_COUNT=0

for file in $TEST_FILES; do
    # Check if file has the issue
    if grep -q "\.get('/api.*\${" "$file" 2>/dev/null || \
       grep -q "\.post('/api.*\${" "$file" 2>/dev/null || \
       grep -q "\.put('/api.*\${" "$file" 2>/dev/null || \
       grep -q "\.patch('/api.*\${" "$file" 2>/dev/null || \
       grep -q "\.delete('/api.*\${" "$file" 2>/dev/null; then

        echo "Fixing: $file"

        # Create backup
        cp "$file" "$file.bak"

        # Fix .get( patterns
        sed -i "s/\.get('\(\/api[^']*\)\${/\.get(\`\1\${/g" "$file"
        sed -i "s/\${\([^}]*\)}')/\${\1}\`)/g" "$file"

        # Fix .post( patterns
        sed -i "s/\.post('\(\/api[^']*\)\${/\.post(\`\1\${/g" "$file"

        # Fix .put( patterns
        sed -i "s/\.put('\(\/api[^']*\)\${/\.put(\`\1\${/g" "$file"

        # Fix .patch( patterns
        sed -i "s/\.patch('\(\/api[^']*\)\${/\.patch(\`\1\${/g" "$file"

        # Fix .delete( patterns
        sed -i "s/\.delete('\(\/api[^']*\)\${/\.delete(\`\1\${/g" "$file"

        FIXED_COUNT=$((FIXED_COUNT + 1))
    fi
done

echo ""
echo "✅ Fixed $FIXED_COUNT test files"
echo ""
echo "Backup files created with .bak extension"
echo "To restore backups: find tests/integration -name '*.bak' -exec bash -c 'mv \"\$0\" \"\${0%.bak}\"' {} \\;"
