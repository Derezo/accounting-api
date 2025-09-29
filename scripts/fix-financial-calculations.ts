#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

interface FixResult {
  file: string;
  changes: number;
  errors: string[];
}

/**
 * Script to fix financial calculation precision issues
 * by replacing problematic floating-point arithmetic with FinancialMath utilities
 */
function fixFinancialCalculations(): FixResult[] {
  const results: FixResult[] = [];

  // Get all TypeScript files in services that contain financial calculations
  const serviceFiles = [
    '/home/eric/Projects/accounting-api/src/services/financial-statements.service.ts',
    '/home/eric/Projects/accounting-api/src/services/payment-analytics.service.ts',
    '/home/eric/Projects/accounting-api/src/services/income-statement.service.ts',
    '/home/eric/Projects/accounting-api/src/services/balance-sheet.service.ts',
    '/home/eric/Projects/accounting-api/src/services/cash-flow.service.ts',
    '/home/eric/Projects/accounting-api/src/services/quote.service.ts'
  ];

  for (const filePath of serviceFiles) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let newContent = content;
      let changes = 0;
      const errors: string[] = [];

      // Check if FinancialMath is already imported
      const hasFinancialImport = /import.*FinancialMath.*from.*financial/.test(content);

      if (!hasFinancialImport) {
        // Add FinancialMath import
        const lastImportMatch = content.match(/import.*?from.*?;[\r\n]*/g);
        if (lastImportMatch) {
          const lastImport = lastImportMatch[lastImportMatch.length - 1];
          const insertIndex = content.indexOf(lastImport) + lastImport.length;
          newContent = newContent.slice(0, insertIndex) +
                     `import { FinancialMath, calculateRatio } from '../utils/financial';\n` +
                     newContent.slice(insertIndex);
          changes++;
        }
      }

      // Pattern 1: Fix percentage calculations like (value / total) * 100
      const percentagePattern = /\(\s*([^)]+)\s*\/\s*([^)]+)\s*\)\s*\*\s*100/g;
      newContent = newContent.replace(percentagePattern, (match, numerator, denominator) => {
        changes++;
        return `FinancialMath.toNumber(calculateRatio(${numerator.trim()}, ${denominator.trim()}))`;
      });

      // Pattern 2: Fix simple division for percentages like value / total * 100
      const simplePercentPattern = /(\w+|\([^)]+\))\s*\/\s*(\w+|\([^)]+\))\s*\*\s*100/g;
      newContent = newContent.replace(simplePercentPattern, (match, numerator, denominator) => {
        // Skip if already converted or if it's a time calculation
        if (match.includes('FinancialMath') || match.includes('60') || match.includes('24') || match.includes('1000')) {
          return match;
        }
        changes++;
        return `FinancialMath.toNumber(calculateRatio(${numerator.trim()}, ${denominator.trim()}))`;
      });

      // Pattern 3: Fix .toFixed(2) calls for currency
      const toFixedPattern = /(\w+|\([^)]+\))\.toFixed\(2\)/g;
      newContent = newContent.replace(toFixedPattern, (match, value) => {
        changes++;
        return `FinancialMath.toString(FinancialMath.toCurrency(${value.trim()}))`;
      });

      // Only write if changes were made
      if (changes > 0) {
        fs.writeFileSync(filePath, newContent);
      }

      results.push({
        file: filePath,
        changes,
        errors
      });

    } catch (error) {
      results.push({
        file: filePath,
        changes: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  return results;
}

async function main() {
  console.log('🔧 Fixing financial calculation precision issues...\n');

  const results = fixFinancialCalculations();

  const successful = results.filter(r => r.changes > 0);
  const failed = results.filter(r => r.errors.length > 0);

  console.log(`✅ Files processed: ${results.length}`);
  console.log(`📝 Files modified: ${successful.length}`);
  console.log(`❌ Files with errors: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\n📋 Modified files:');
    successful.forEach(r => {
      console.log(`   ${path.basename(r.file)}: ${r.changes} changes`);
    });
  }

  if (failed.length > 0) {
    console.log('\n⚠️  Files with errors:');
    failed.forEach(r => {
      console.log(`   ${path.basename(r.file)}: ${r.errors.join(', ')}`);
    });
  }

  console.log('\n🎯 Summary:');
  const totalChanges = successful.reduce((sum, r) => sum + r.changes, 0);
  console.log(`- Total changes made: ${totalChanges}`);
  console.log(`- Files processed successfully: ${successful.length}`);

  if (totalChanges > 0) {
    console.log('\n🔄 Next steps:');
    console.log('1. Review the changes to ensure correctness');
    console.log('2. Test financial calculations manually');
    console.log('3. Run integration tests for payment and tax calculations');
    console.log('4. Consider adding unit tests for financial utilities');
  }

  return totalChanges > 0 ? 0 : 1;
}

if (require.main === module) {
  main().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { fixFinancialCalculations };