#!/usr/bin/env ts-node

/**
 * OpenAPI Documentation Generator
 *
 * This script generates a complete OpenAPI specification by:
 * 1. Starting the server to load all routes
 * 2. Fetching the merged specification from Swagger
 * 3. Saving it to docs/openapi-generated.yaml
 *
 * Usage: npm run docs:generate-openapi
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as http from 'http';

const TIMEOUT = 10000; // 10 seconds
const PORT = process.env.PORT || 3000;
const API_URL = `http://localhost:${PORT}`;
const OUTPUT_PATH = path.join(process.cwd(), 'docs', 'openapi-generated.yaml');

function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function waitForServer(url: string, maxAttempts: number = 20): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await httpGet(`${url}/health`);
      return true;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return false;
}

async function fetchOpenAPISpec(): Promise<any> {
  try {
    return await httpGet(`${API_URL}/api-docs/openapi.json`);
  } catch (error) {
    console.error('❌ Failed to fetch OpenAPI specification:', error);
    throw error;
  }
}

async function generateOpenAPISpec(): Promise<void> {
  console.log('🚀 Starting OpenAPI documentation generation...');

  // Start the server in the background
  console.log('📦 Starting development server...');
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  let serverOutput = '';
  serverProcess.stdout?.on('data', (data) => {
    serverOutput += data.toString();
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error('Server error:', data.toString());
  });

  try {
    // Wait for server to be ready
    console.log('⏳ Waiting for server to be ready...');
    const serverReady = await waitForServer(API_URL);

    if (!serverReady) {
      throw new Error('Server failed to start within timeout period');
    }

    console.log('✅ Server is ready!');

    // Fetch the OpenAPI specification
    console.log('📥 Fetching OpenAPI specification...');
    const spec = await fetchOpenAPISpec();

    // Add metadata
    spec.info = {
      ...spec.info,
      'x-generated-at': new Date().toISOString(),
      'x-generated-by': 'generate-openapi.ts',
      'x-total-endpoints': Object.keys(spec.paths || {}).length
    };

    // Sort paths alphabetically for consistency
    if (spec.paths) {
      const sortedPaths: Record<string, any> = {};
      Object.keys(spec.paths).sort().forEach(key => {
        sortedPaths[key] = spec.paths[key];
      });
      spec.paths = sortedPaths;
    }

    // Sort tags alphabetically
    if (spec.tags) {
      spec.tags.sort((a: any, b: any) => a.name.localeCompare(b.name));
    }

    // Convert to YAML
    const yamlContent = yaml.dump(spec, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });

    // Write to file
    fs.writeFileSync(OUTPUT_PATH, yamlContent, 'utf8');

    console.log(`✅ OpenAPI specification generated successfully!`);
    console.log(`📄 Output: ${OUTPUT_PATH}`);
    console.log(`📊 Total endpoints documented: ${Object.keys(spec.paths || {}).length}`);

    // Count by method
    const methodCounts: Record<string, number> = {};
    Object.values(spec.paths || {}).forEach((pathItem: any) => {
      Object.keys(pathItem).forEach(method => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          methodCounts[method.toUpperCase()] = (methodCounts[method.toUpperCase()] || 0) + 1;
        }
      });
    });

    console.log('\n📈 Endpoints by method:');
    Object.entries(methodCounts).forEach(([method, count]) => {
      console.log(`   ${method}: ${count}`);
    });

    // List tags
    if (spec.tags && spec.tags.length > 0) {
      console.log('\n🏷️  API Tags:');
      spec.tags.forEach((tag: any) => {
        console.log(`   - ${tag.name}: ${tag.description || 'No description'}`);
      });
    }

  } finally {
    // Clean up: kill the server process
    console.log('\n🧹 Cleaning up...');
    serverProcess.kill('SIGTERM');

    // Give it a moment to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force kill if still running
    try {
      serverProcess.kill('SIGKILL');
    } catch {
      // Process already terminated
    }
  }

  console.log('✨ Documentation generation complete!');
}

// Run the generator
generateOpenAPISpec()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Documentation generation failed:', error);
    process.exit(1);
  });