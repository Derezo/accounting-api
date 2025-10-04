#!/bin/bash

# Script to fix test route patterns to use proper API versioning and org context
# This fixes 404 errors in integration tests

echo "🔧 Fixing test route patterns..."

# Define the test files to fix
TEST_FILES=(
  "tests/integration/auth-authorization.test.ts"
  "tests/integration/audit-logging.test.ts"
  "tests/integration/performance-security.test.ts"
)

for file in "${TEST_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "⚠️  Skipping $file (not found)"
    continue
  fi

  echo "📝 Processing $file..."

  # Import routes helper if not already imported
  if ! grep -q "import.*routes.*from.*test-utils" "$file"; then
    # Add routes to existing imports from test-utils
    sed -i "s/} from '\.\/test-utils'/,\n  routes\n} from '.\/test-utils'/" "$file"
  fi

  # Fix auth routes (no org ID needed)
  sed -i "s|'/api/auth/login'|routes.auth.login()|g" "$file"
  sed -i "s|'/api/auth/register'|routes.auth.register()|g" "$file"
  sed -i "s|'/api/auth/refresh'|routes.auth.refresh()|g" "$file"
  sed -i "s|'/api/auth/logout'|routes.auth.logout()|g" "$file"
  sed -i "s|'/api/auth/forgot-password'|routes.auth.forgotPassword()|g" "$file"
  sed -i "s|'/api/auth/reset-password'|routes.auth.resetPassword()|g" "$file"
  sed -i "s|'/api/auth/profile'|routes.auth.profile()|g" "$file"

  # For org-scoped routes, we need to be more careful since they need organizationId
  # We'll use a pattern that captures the context where organization.id is available

  echo "✅ Fixed $file"
done

echo "✨ Route fixes complete!"
echo ""
echo "⚠️  NOTE: Org-scoped routes (customers, quotes, etc.) need manual review"
echo "   Use: routes.org(organization.id).customers() instead of '/api/customers'"
