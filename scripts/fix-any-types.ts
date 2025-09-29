#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

interface TypeFixResult {
  file: string;
  fixes: number;
  patterns: string[];
}

/**
 * Script to replace common 'any' type patterns with proper TypeScript types
 */
function fixAnyTypes(): TypeFixResult[] {
  const results: TypeFixResult[] = [];

  // Get all service files that need fixing
  const serviceFiles = [
    '/home/eric/Projects/accounting-api/src/services/customer.service.ts',
    '/home/eric/Projects/accounting-api/src/services/audit.service.ts',
    '/home/eric/Projects/accounting-api/src/services/payment-analytics.service.ts',
    '/home/eric/Projects/accounting-api/src/services/payment-security.service.ts',
    '/home/eric/Projects/accounting-api/src/services/manual-payment.service.ts',
    '/home/eric/Projects/accounting-api/src/services/quote.service.ts',
    '/home/eric/Projects/accounting-api/src/services/invoice.service.ts',
    '/home/eric/Projects/accounting-api/src/services/etransfer.service.ts'
  ];

  for (const filePath of serviceFiles) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let newContent = content;
      let fixes = 0;
      const patterns: string[] = [];

      // Pattern 1: any[] arrays -> Record<string, unknown>[] or unknown[]
      const anyArrayPattern = /: any\[\]/g;
      newContent = newContent.replace(anyArrayPattern, (match) => {
        fixes++;
        patterns.push('any[] -> unknown[]');
        return ': unknown[]';
      });

      // Pattern 2: function parameters: any -> Record<string, unknown> (for object-like data)
      const paramAnyPattern = /(data|payload|options|params|filters|where|query|changes|details): any\b/g;
      newContent = newContent.replace(paramAnyPattern, (match, paramName) => {
        fixes++;
        patterns.push(`${paramName}: any -> Record<string, unknown>`);
        return `${paramName}: Record<string, unknown>`;
      });

      // Pattern 3: return types: any -> unknown for general cases
      const returnAnyPattern = /: Promise<any>/g;
      newContent = newContent.replace(returnAnyPattern, (match) => {
        fixes++;
        patterns.push('Promise<any> -> Promise<unknown>');
        return ': Promise<unknown>';
      });

      // Pattern 4: variable declarations: any -> unknown
      const varAnyPattern = /: any = /g;
      newContent = newContent.replace(varAnyPattern, (match) => {
        fixes++;
        patterns.push('variable: any -> unknown');
        return ': unknown = ';
      });

      // Pattern 5: const any[] -> const unknown[]
      const constAnyArrayPattern = /const (\w+): any\[\]/g;
      newContent = newContent.replace(constAnyArrayPattern, (match, varName) => {
        fixes++;
        patterns.push(`const ${varName}: any[] -> unknown[]`);
        return `const ${varName}: unknown[]`;
      });

      // Pattern 6: Generic any -> unknown for simple cases
      const simpleAnyPattern = /(?<!Promise<)(?<!Array<)(?<![\w]): any(?!\[\]|\[|\.])/g;
      newContent = newContent.replace(simpleAnyPattern, (match) => {
        fixes++;
        patterns.push('simple any -> unknown');
        return ': unknown';
      });

      // Only write if changes were made
      if (fixes > 0) {
        fs.writeFileSync(filePath, newContent);
      }

      results.push({
        file: filePath,
        fixes,
        patterns
      });

    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
    }
  }

  return results;
}

async function main() {
  console.log('🔧 Fixing TypeScript "any" types...\n');

  const results = fixAnyTypes();

  const modified = results.filter(r => r.fixes > 0);
  const totalFixes = modified.reduce((sum, r) => sum + r.fixes, 0);

  console.log(`✅ Files processed: ${results.length}`);
  console.log(`📝 Files modified: ${modified.length}`);
  console.log(`🔧 Total fixes applied: ${totalFixes}`);

  if (modified.length > 0) {
    console.log('\n📋 Modified files:');
    modified.forEach(r => {
      console.log(`   ${path.basename(r.file)}: ${r.fixes} fixes`);
      r.patterns.forEach(pattern => {
        console.log(`     - ${pattern}`);
      });
    });
  }

  console.log('\n🎯 Summary:');
  console.log('- Replaced common "any" types with proper TypeScript types');
  console.log('- Used "unknown" for general unknown data types');
  console.log('- Used "Record<string, unknown>" for object-like data');
  console.log('- Maintained type safety while improving code quality');

  if (totalFixes > 0) {
    console.log('\n🔄 Next steps:');
    console.log('1. Review the changes for correctness');
    console.log('2. Run TypeScript compiler to check for new errors');
    console.log('3. Add more specific interfaces where possible');
    console.log('4. Consider using union types for better type safety');
  }

  return totalFixes > 0 ? 0 : 1;
}

if (require.main === module) {
  main().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { fixAnyTypes };