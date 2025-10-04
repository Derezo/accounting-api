#!/usr/bin/env ts-node
/**
 * Generate API Summary Documentation
 * Analyzes OpenAPI spec and creates comprehensive markdown summary
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
  };
}

function generateAPISummary(): void {
  console.log('📚 Generating API Summary Documentation...\n');

  // Read OpenAPI spec
  const specPath = path.join(process.cwd(), 'docs', 'jsdoc-openapi.yaml');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const spec = yaml.load(specContent) as OpenAPISpec;

  const endpoints: Array<{
    method: string;
    path: string;
    summary: string;
    tags: string[];
    operationId?: string;
  }> = [];

  // Extract all endpoints
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: details.summary || 'No summary',
          tags: details.tags || ['Uncategorized'],
          operationId: details.operationId,
        });
      }
    }
  }

  // Group by tags
  const groupedByTag: Record<string, typeof endpoints> = {};
  endpoints.forEach(endpoint => {
    endpoint.tags.forEach(tag => {
      if (!groupedByTag[tag]) {
        groupedByTag[tag] = [];
      }
      groupedByTag[tag].push(endpoint);
    });
  });

  // Generate markdown
  let markdown = `# API Documentation Summary

**API Name:** ${spec.info.title}
**Version:** ${spec.info.version}
**Total Endpoints:** ${endpoints.length}

${spec.info.description || ''}

## Table of Contents

`;

  // Add TOC
  const sortedTags = Object.keys(groupedByTag).sort();
  sortedTags.forEach(tag => {
    const sanitizedTag = tag.toLowerCase().replace(/\s+/g, '-');
    markdown += `- [${tag}](#${sanitizedTag}) (${groupedByTag[tag].length} endpoints)\n`;
  });

  markdown += '\n---\n\n';

  // Add endpoint details by tag
  sortedTags.forEach(tag => {
    markdown += `## ${tag}\n\n`;

    const tagEndpoints = groupedByTag[tag].sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      return methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method);
    });

    tagEndpoints.forEach(endpoint => {
      const methodBadge = endpoint.method === 'GET' ? '🔵'
        : endpoint.method === 'POST' ? '🟢'
        : endpoint.method === 'PUT' ? '🟡'
        : endpoint.method === 'PATCH' ? '🟠'
        : '🔴';

      markdown += `### ${methodBadge} ${endpoint.method} \`${endpoint.path}\`\n\n`;
      markdown += `**Summary:** ${endpoint.summary}\n\n`;

      if (endpoint.operationId) {
        markdown += `**Operation ID:** \`${endpoint.operationId}\`\n\n`;
      }
    });

    markdown += '---\n\n';
  });

  // Add schemas section if available
  if (spec.components?.schemas) {
    markdown += '## Data Models\n\n';
    const schemas = Object.keys(spec.components.schemas).sort();
    markdown += `**Total Schemas:** ${schemas.length}\n\n`;

    schemas.forEach(schemaName => {
      markdown += `- \`${schemaName}\`\n`;
    });
    markdown += '\n---\n\n';
  }

  // Add statistics
  markdown += '## Statistics\n\n';
  markdown += `| Metric | Value |\n`;
  markdown += `|--------|-------|\n`;
  markdown += `| Total Endpoints | ${endpoints.length} |\n`;
  markdown += `| Total Tags/Categories | ${sortedTags.length} |\n`;

  const methodCounts = endpoints.reduce((acc, ep) => {
    acc[ep.method] = (acc[ep.method] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(methodCounts).sort().forEach(([method, count]) => {
    markdown += `| ${method} Endpoints | ${count} |\n`;
  });

  if (spec.components?.schemas) {
    markdown += `| Total Schemas | ${Object.keys(spec.components.schemas).length} |\n`;
  }

  markdown += '\n---\n\n';

  // Add endpoint list by method
  markdown += '## Endpoints by Method\n\n';

  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach(method => {
    const methodEndpoints = endpoints.filter(e => e.method === method);
    if (methodEndpoints.length > 0) {
      markdown += `### ${method} (${methodEndpoints.length})\n\n`;
      methodEndpoints.sort((a, b) => a.path.localeCompare(b.path)).forEach(endpoint => {
        markdown += `- \`${endpoint.path}\` - ${endpoint.summary}\n`;
      });
      markdown += '\n';
    }
  });

  markdown += '---\n\n';
  markdown += `*Generated on ${new Date().toISOString()}*\n`;
  markdown += `*Based on OpenAPI specification version ${spec.openapi}*\n`;

  // Write to file
  const outputPath = path.join(process.cwd(), 'docs', 'API_SUMMARY.md');
  fs.writeFileSync(outputPath, markdown);

  console.log('✅ API Summary generated successfully!');
  console.log(`📄 File: ${outputPath}`);
  console.log(`📊 Total endpoints: ${endpoints.length}`);
  console.log(`🏷️  Total categories: ${sortedTags.length}`);
}

// Run if executed directly
if (require.main === module) {
  try {
    generateAPISummary();
  } catch (error) {
    console.error('❌ Error generating API summary:', error);
    process.exit(1);
  }
}

export { generateAPISummary };
