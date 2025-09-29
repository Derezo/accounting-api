#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

interface FixResult {
  file: string;
  fixed: boolean;
  error?: string;
}

/**
 * Script to fix dependency injection anti-pattern by replacing individual PrismaClient instances
 * with the singleton pattern from database config
 */
function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  function walkDir(currentDir: string) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (item.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(dir);
  return files;
}

async function fixPrismaInstances(): Promise<FixResult[]> {
  const results: FixResult[] = [];

  // Find all TypeScript files in src/ that might have PrismaClient instances
  const files = getAllTsFiles('/home/eric/Projects/accounting-api/src');

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Skip files that don't have PrismaClient instances
      if (!content.includes('new PrismaClient')) {
        continue;
      }

      // Skip test files - they need separate handling
      if (filePath.includes('.test.ts') || filePath.includes('.spec.ts')) {
        results.push({
          file: filePath,
          fixed: false,
          error: 'Skipped test file - needs manual review'
        });
        continue;
      }

      let newContent = content;
      let wasFixed = false;

      // Pattern 1: Replace import of PrismaClient and const prisma = new PrismaClient()
      const importPattern = /import\s*\{\s*([^}]*?)PrismaClient([^}]*?)\}\s*from\s*['"]@prisma\/client['"];?/g;
      const prismaInstancePattern = /const\s+prisma\s*=\s*new\s+PrismaClient\([^)]*\);?/g;

      if (importPattern.test(content) && prismaInstancePattern.test(content)) {
        // Update import to remove PrismaClient
        newContent = newContent.replace(importPattern, (match, before, after) => {
          const beforeClean = before.trim().replace(/,$/, '');
          const afterClean = after.trim().replace(/^,/, '');

          let newImports = [];
          if (beforeClean) newImports.push(beforeClean);
          if (afterClean) newImports.push(afterClean);

          if (newImports.length === 0) {
            return ''; // Remove entire import if only PrismaClient was imported
          }

          return `import { ${newImports.join(', ')} } from '@prisma/client';`;
        });

        // Remove the prisma instance creation
        newContent = newContent.replace(prismaInstancePattern, '');

        // Add import for singleton prisma
        const hasConfigImport = /import.*from.*['"]\.\.?\/.*config\/database['"]/.test(newContent);
        if (!hasConfigImport) {
          // Find the right relative path to config/database
          const relativePath = path.relative(path.dirname(filePath), '/home/eric/Projects/accounting-api/src/config/database');
          const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
          const cleanImportPath = importPath.replace(/\.ts$/, '');

          // Insert the import after existing imports
          const lastImportMatch = newContent.match(/import.*?from.*?;[\r\n]*/g);
          if (lastImportMatch) {
            const lastImport = lastImportMatch[lastImportMatch.length - 1];
            const insertIndex = newContent.indexOf(lastImport) + lastImport.length;
            newContent = newContent.slice(0, insertIndex) +
                       `import { prisma } from '${cleanImportPath}';\n` +
                       newContent.slice(insertIndex);
          } else {
            // Fallback: add at the beginning
            newContent = `import { prisma } from '${cleanImportPath}';\n` + newContent;
          }
        }

        wasFixed = true;
      }

      // Only write if changes were made
      if (wasFixed) {
        fs.writeFileSync(filePath, newContent);
        results.push({
          file: filePath,
          fixed: true
        });
      }

    } catch (error) {
      results.push({
        file: filePath,
        fixed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

async function main() {
  console.log('🔧 Fixing PrismaClient dependency injection anti-pattern...\n');

  const results = await fixPrismaInstances();

  const fixed = results.filter(r => r.fixed);
  const skipped = results.filter(r => !r.fixed && !r.error);
  const errors = results.filter(r => r.error);

  console.log(`✅ Fixed: ${fixed.length} files`);
  fixed.forEach(r => console.log(`   ${r.file}`));

  if (errors.length > 0) {
    console.log(`\n⚠️  Skipped: ${errors.length} files`);
    errors.forEach(r => console.log(`   ${r.file}: ${r.error}`));
  }

  console.log('\n📋 Summary:');
  console.log(`- Files fixed: ${fixed.length}`);
  console.log(`- Files skipped: ${errors.length}`);
  console.log(`- Total processed: ${results.length}`);

  if (fixed.length > 0) {
    console.log('\n🔄 Recommendations:');
    console.log('1. Review the changes and test the affected services');
    console.log('2. Run tests to ensure no breaking changes');
    console.log('3. Consider implementing proper dependency injection containers');
  }

  return fixed.length > 0 ? 0 : 1;
}

if (require.main === module) {
  main().then(code => {
    process.exit(code);
  }).catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { fixPrismaInstances };