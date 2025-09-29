#!/usr/bin/env ts-node

import http from 'http';
import fs from 'fs';
import path from 'path';

interface ValidationResult {
  endpoint: string;
  method: string;
  issues: string[];
  score: number;
}

interface DocumentationReport {
  totalEndpoints: number;
  wellDocumented: number;
  needsImprovement: number;
  missing: number;
  results: ValidationResult[];
  summary: {
    avgScore: number;
    coveragePercentage: number;
    criticalIssues: string[];
  };
}

// Fetch OpenAPI spec from running server
function fetchOpenAPISpec(): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000/api-docs/openapi.json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Validate individual endpoint documentation
function validateEndpoint(path: string, method: string, spec: any): ValidationResult {
  const endpoint = spec.paths[path][method];
  const issues: string[] = [];
  let score = 0;

  // Check for basic documentation
  if (!endpoint.summary) {
    issues.push('Missing summary');
  } else {
    score += 20;
    if (endpoint.summary.length < 10) {
      issues.push('Summary too brief (< 10 characters)');
    } else {
      score += 5;
    }
  }

  if (!endpoint.description) {
    issues.push('Missing description');
  } else {
    score += 20;
    if (endpoint.description.length < 30) {
      issues.push('Description too brief (< 30 characters)');
    } else {
      score += 10;
    }
  }

  // Check for tags
  if (!endpoint.tags || endpoint.tags.length === 0) {
    issues.push('Missing tags');
  } else {
    score += 10;
  }

  // Check parameters documentation
  if (endpoint.parameters) {
    const undocumentedParams = endpoint.parameters.filter((p: any) => !p.description);
    if (undocumentedParams.length > 0) {
      issues.push(`${undocumentedParams.length} parameter(s) missing description`);
    } else {
      score += 15;
    }
  }

  // Check request body documentation
  if (endpoint.requestBody) {
    if (!endpoint.requestBody.description) {
      issues.push('Request body missing description');
    } else {
      score += 10;
    }

    // Check if request body has schema examples
    const content = endpoint.requestBody.content;
    if (content) {
      const hasExamples = Object.values(content).some((c: any) => c.example || c.examples);
      if (!hasExamples) {
        issues.push('Request body missing examples');
      } else {
        score += 10;
      }
    }
  }

  // Check response documentation
  if (!endpoint.responses) {
    issues.push('Missing response definitions');
  } else {
    score += 10;

    const responses = endpoint.responses;
    const hasSuccessResponse = Object.keys(responses).some(code => code.startsWith('2'));
    if (!hasSuccessResponse) {
      issues.push('Missing success response (2xx)');
    } else {
      score += 5;
    }

    const hasErrorResponse = responses['400'] || responses['401'] || responses['403'] || responses['404'] || responses['500'];
    if (!hasErrorResponse) {
      issues.push('Missing error responses');
    } else {
      score += 5;
    }

    // Check if responses have descriptions and examples
    for (const [code, response] of Object.entries(responses)) {
      const resp = response as any;
      if (!resp.description) {
        issues.push(`Response ${code} missing description`);
      }

      if (resp.content) {
        const hasResponseExamples = Object.values(resp.content).some((c: any) => c.example || c.examples);
        if (!hasResponseExamples && code.startsWith('2')) {
          issues.push(`Response ${code} missing examples`);
        }
      }
    }
  }

  // Check for security documentation
  if (endpoint.security) {
    score += 5;
  } else if (!path.includes('/auth/') && !path.includes('/health')) {
    issues.push('Missing security requirements');
  }

  return {
    endpoint: `${method.toUpperCase()} ${path}`,
    method: method.toUpperCase(),
    issues,
    score: Math.min(100, score)
  };
}

// Generate documentation report
function generateReport(spec: any): DocumentationReport {
  const results: ValidationResult[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, _] of Object.entries(methods as any)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        results.push(validateEndpoint(path, method, spec));
      }
    }
  }

  const wellDocumented = results.filter(r => r.score >= 80).length;
  const needsImprovement = results.filter(r => r.score >= 60 && r.score < 80).length;
  const missing = results.filter(r => r.score < 60).length;

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const coveragePercentage = (wellDocumented / results.length) * 100;

  // Identify critical issues
  const criticalIssues: string[] = [];
  const issueCount: { [key: string]: number } = {};

  results.forEach(r => {
    r.issues.forEach(issue => {
      issueCount[issue] = (issueCount[issue] || 0) + 1;
    });
  });

  Object.entries(issueCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([issue, count]) => {
      criticalIssues.push(`${issue} (${count} endpoints)`);
    });

  return {
    totalEndpoints: results.length,
    wellDocumented,
    needsImprovement,
    missing,
    results: results.sort((a, b) => a.score - b.score),
    summary: {
      avgScore: Math.round(avgScore * 100) / 100,
      coveragePercentage: Math.round(coveragePercentage * 100) / 100,
      criticalIssues
    }
  };
}

// Output detailed report
function outputReport(report: DocumentationReport) {
  console.log('\n📋 API Documentation Validation Report');
  console.log('=====================================\n');

  console.log('📊 Summary:');
  console.log(`Total Endpoints: ${report.totalEndpoints}`);
  console.log(`Well Documented (≥80%): ${report.wellDocumented} (${Math.round((report.wellDocumented/report.totalEndpoints)*100)}%)`);
  console.log(`Needs Improvement (60-79%): ${report.needsImprovement} (${Math.round((report.needsImprovement/report.totalEndpoints)*100)}%)`);
  console.log(`Poorly Documented (<60%): ${report.missing} (${Math.round((report.missing/report.totalEndpoints)*100)}%)`);
  console.log(`Average Score: ${report.summary.avgScore}%`);
  console.log(`Coverage: ${report.summary.coveragePercentage}%\n`);

  console.log('🚨 Top Issues:');
  report.summary.criticalIssues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });

  console.log('\n📋 Endpoints Needing Attention (Score < 80%):');
  console.log('============================================\n');

  const needingAttention = report.results.filter(r => r.score < 80);
  needingAttention.forEach(result => {
    console.log(`${result.endpoint} (Score: ${result.score}%)`);
    result.issues.forEach(issue => {
      console.log(`  ❌ ${issue}`);
    });
    console.log('');
  });

  if (needingAttention.length === 0) {
    console.log('🎉 All endpoints are well documented!\n');
  }

  // Output improvement recommendations
  console.log('💡 Recommendations:');
  console.log('===================\n');

  if (report.summary.criticalIssues.some(issue => issue.includes('Missing description'))) {
    console.log('1. Add comprehensive descriptions to all endpoints');
    console.log('   - Explain what the endpoint does');
    console.log('   - Describe the business use case');
    console.log('   - Include any important constraints or requirements\n');
  }

  if (report.summary.criticalIssues.some(issue => issue.includes('Missing examples'))) {
    console.log('2. Add request/response examples');
    console.log('   - Include realistic sample data');
    console.log('   - Show different scenarios (success, error cases)');
    console.log('   - Use consistent formatting\n');
  }

  if (report.summary.criticalIssues.some(issue => issue.includes('Missing tags'))) {
    console.log('3. Organize endpoints with proper tags');
    console.log('   - Group related endpoints');
    console.log('   - Use consistent naming conventions');
    console.log('   - Follow the existing tag structure\n');
  }

  if (report.summary.criticalIssues.some(issue => issue.includes('security'))) {
    console.log('4. Document security requirements');
    console.log('   - Specify required authentication');
    console.log('   - Document required permissions');
    console.log('   - Include rate limiting information\n');
  }

  console.log('📁 For JSDoc improvements, check controller files in src/controllers/');
  console.log('📁 For schema documentation, check types in src/types/');
  console.log('📁 For examples, check docs/examples/ directory\n');
}

// Save detailed report to file
function saveReport(report: DocumentationReport) {
  const reportPath = path.join(process.cwd(), 'docs', 'documentation-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);

  // Also save a CSV for easy analysis
  const csvPath = path.join(process.cwd(), 'docs', 'documentation-validation.csv');
  const csvContent = [
    'Endpoint,Method,Score,Issues',
    ...report.results.map(r => `"${r.endpoint}","${r.method}",${r.score},"${r.issues.join('; ')}"`)
  ].join('\n');

  fs.writeFileSync(csvPath, csvContent);
  console.log(`📊 CSV report saved to: ${csvPath}`);
}

// Main execution
async function main() {
  try {
    console.log('🔍 Fetching OpenAPI specification...');
    const spec = await fetchOpenAPISpec();

    console.log('📋 Analyzing documentation coverage...');
    const report = generateReport(spec);

    outputReport(report);
    saveReport(report);

    // Exit with appropriate code
    if (report.summary.coveragePercentage < 80) {
      console.log(`\n⚠️  Documentation coverage is below 80% (${report.summary.coveragePercentage}%)`);
      console.log('Consider improving documentation before production deployment.');
      process.exit(1);
    } else {
      console.log(`\n✅ Documentation coverage is good (${report.summary.coveragePercentage}%)`);
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Error validating documentation:', error);
    console.log('\n💡 Make sure the development server is running:');
    console.log('   npm run dev');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { validateEndpoint, generateReport, DocumentationReport, ValidationResult };