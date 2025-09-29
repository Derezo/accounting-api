#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

interface JSDocEnhancement {
  pattern: RegExp;
  replacement: string;
}

// Enhanced JSDoc templates for common accounting endpoints
const enhancements: JSDocEnhancement[] = [
  // Get accounts endpoint
  {
    pattern: /(\s+)\/\*\*\s*\n\s+\*\s+@desc\s+Get accounts\s*\n\s+\*\s+@route\s+GET\s+\/api\/v1\/organizations\/:organizationId\/accounting\/accounts\s*\n\s+\*\s+@access\s+Private.*?\n\s+\*\//gms,
    replacement: `$1/**
$1 * @desc    Get chart of accounts for organization
$1 * @route   GET /api/v1/organizations/:organizationId/accounting/accounts
$1 * @access  Private (ACCOUNTANT+)
$1 * @summary Get chart of accounts
$1 * @description Retrieves the complete chart of accounts for an organization, including account balances and hierarchical structure. Only active accounts are returned by default.
$1 * @param   {string} organizationId - Organization identifier
$1 * @param   {boolean} [includeInactive] - Include inactive accounts in response
$1 * @param   {string} [accountType] - Filter by account type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
$1 * @returns {object} 200 - List of accounts with balances and metadata
$1 * @returns {object} 401 - Authentication required
$1 * @returns {object} 403 - Insufficient permissions
$1 * @returns {object} 500 - Server error
$1 * @example
$1 * // Response
$1 * {
$1 *   "success": true,
$1 *   "data": [
$1 *     {
$1 *       "id": "acc_123",
$1 *       "accountNumber": "1000",
$1 *       "name": "Cash",
$1 *       "type": "ASSET",
$1 *       "balance": 15000.00,
$1 *       "isActive": true,
$1 *       "parentId": null,
$1 *       "children": []
$1 *     }
$1 *   ]
$1 * }
$1 */`
  },

  // Account balance endpoint
  {
    pattern: /(\s+)\/\*\*\s*\n\s+\*\s+@desc\s+Get account balance\s*\n\s+\*\s+@route\s+GET\s+\/api\/v1\/organizations\/:organizationId\/accounting\/accounts\/:accountId\/balance\s*\n\s+\*\s+@access\s+Private.*?\n\s+\*\//gms,
    replacement: `$1/**
$1 * @desc    Get current balance for a specific account
$1 * @route   GET /api/v1/organizations/:organizationId/accounting/accounts/:accountId/balance
$1 * @access  Private (ACCOUNTANT+)
$1 * @summary Get account balance
$1 * @description Retrieves the current balance for a specific account, including the last transaction date and balance calculation details.
$1 * @param   {string} organizationId - Organization identifier
$1 * @param   {string} accountId - Account identifier
$1 * @returns {object} 200 - Account balance with metadata
$1 * @returns {object} 404 - Account not found
$1 * @returns {object} 401 - Authentication required
$1 * @returns {object} 403 - Insufficient permissions
$1 * @returns {object} 500 - Server error
$1 * @example
$1 * // Response
$1 * {
$1 *   "success": true,
$1 *   "data": {
$1 *     "accountId": "acc_123",
$1 *     "accountNumber": "1000",
$1 *     "accountName": "Cash",
$1 *     "accountType": "ASSET",
$1 *     "balance": 15000.00,
$1 *     "lastTransactionDate": "2024-01-15T14:30:00.000Z"
$1 *   }
$1 * }
$1 */`
  },

  // Validate accounting equation
  {
    pattern: /(\s+)\/\*\*\s*\n\s+\*\s+@desc\s+Validate accounting equation\s*\n\s+\*\s+@route\s+GET\s+\/api\/v1\/organizations\/:organizationId\/accounting\/validate\s*\n\s+\*\s+@access\s+Private.*?\n\s+\*\//gms,
    replacement: `$1/**
$1 * @desc    Validate fundamental accounting equation (Assets = Liabilities + Equity)
$1 * @route   GET /api/v1/organizations/:organizationId/accounting/validate
$1 * @access  Private (ACCOUNTANT+)
$1 * @summary Validate accounting equation
$1 * @description Validates that the fundamental accounting equation holds true for the organization's books. Returns detailed breakdown of assets, liabilities, and equity totals.
$1 * @param   {string} organizationId - Organization identifier
$1 * @returns {object} 200 - Validation results with equation breakdown
$1 * @returns {object} 401 - Authentication required
$1 * @returns {object} 403 - Insufficient permissions
$1 * @returns {object} 500 - Server error
$1 * @example
$1 * // Response
$1 * {
$1 *   "success": true,
$1 *   "data": {
$1 *     "isValid": true,
$1 *     "assets": 58500.00,
$1 *     "liabilities": 4000.00,
$1 *     "equity": 54500.00,
$1 *     "difference": 0.00
$1 *   }
$1 * }
$1 */`
  },

  // Transaction types endpoint
  {
    pattern: /(\s+)\/\*\*\s*\n\s+\*\s+@desc\s+Get transaction types\s*\n\s+\*\s+@route\s+GET\s+\/api\/v1\/organizations\/:organizationId\/accounting\/transaction-types\s*\n\s+\*\s+@access\s+Private.*?\n\s+\*\//gms,
    replacement: `$1/**
$1 * @desc    Get available transaction types for business transactions
$1 * @route   GET /api/v1/organizations/:organizationId/accounting/transaction-types
$1 * @access  Private (ACCOUNTANT+)
$1 * @summary Get transaction types
$1 * @description Retrieves the list of supported business transaction types that can be used with the business transaction creation endpoint.
$1 * @param   {string} organizationId - Organization identifier
$1 * @returns {object} 200 - List of available transaction types
$1 * @returns {object} 401 - Authentication required
$1 * @returns {object} 403 - Insufficient permissions
$1 * @returns {object} 500 - Server error
$1 * @example
$1 * // Response
$1 * {
$1 *   "success": true,
$1 *   "data": [
$1 *     {
$1 *       "type": "SALE",
$1 *       "name": "Sales Transaction",
$1 *       "description": "Record sales revenue and cost of goods sold",
$1 *       "requiredFields": ["customerId", "amount", "items"]
$1 *     },
$1 *     {
$1 *       "type": "PURCHASE",
$1 *       "name": "Purchase Transaction",
$1 *       "description": "Record inventory or expense purchases",
$1 *       "requiredFields": ["supplierId", "amount", "items"]
$1 *     }
$1 *   ]
$1 * }
$1 */`
  }
];

// Function to enhance JSDoc in a file
function enhanceJSDocInFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  for (const enhancement of enhancements) {
    if (enhancement.pattern.test(content)) {
      content = content.replace(enhancement.pattern, enhancement.replacement);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Enhanced JSDoc in: ${path.basename(filePath)}`);
    return true;
  }

  return false;
}

// Main execution
async function main() {
  console.log('🔧 Enhancing JSDoc documentation across controllers...\n');

  const controllersDir = path.join(process.cwd(), 'src', 'controllers');
  const controllerFiles = fs.readdirSync(controllersDir)
    .filter(file => file.endsWith('.controller.ts'))
    .map(file => path.join(controllersDir, file));

  let totalEnhanced = 0;

  for (const filePath of controllerFiles) {
    const enhanced = enhanceJSDocInFile(filePath);
    if (enhanced) {
      totalEnhanced++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`Total controller files processed: ${controllerFiles.length}`);
  console.log(`Files enhanced: ${totalEnhanced}`);

  if (totalEnhanced > 0) {
    console.log(`\n🔄 Regenerating OpenAPI documentation...`);
    // The documentation will be regenerated automatically when the server restarts
    console.log(`📋 OpenAPI spec will be updated on next server restart or docs:generate`);
  } else {
    console.log(`\n✅ All JSDoc documentation is already comprehensive`);
  }

  return totalEnhanced;
}

if (require.main === module) {
  main().then(enhanced => {
    process.exit(enhanced > 0 ? 0 : 1);
  }).catch(error => {
    console.error('❌ Error enhancing JSDoc:', error);
    process.exit(1);
  });
}

export { enhanceJSDocInFile, enhancements };