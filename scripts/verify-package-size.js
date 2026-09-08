#!/usr/bin/env node
'use strict';

/**
 * scripts/verify-package-size.js
 * Asserts that the npm distribution tarball unpacked size is strictly under 2 MB.
 */

const { execSync } = require('child_process');
const path = require('path');

const MAX_UNPACKED_BYTES = 2 * 1024 * 1024; // 2 MB target

try {
  const root = path.resolve(__dirname, '..');
  const output = execSync('npm pack --dry-run --json', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  const parsed = JSON.parse(output);
  const packageInfo = Array.isArray(parsed) ? parsed[0] : parsed;
  const unpackedSize = packageInfo.unpackedSize;
  const tarballSize = packageInfo.size;
  const fileCount = packageInfo.entryCount;

  console.log('───────────────────────────────────────────────────────');
  console.log('  ContextOS NPM Package Size Verification');
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Package:       ${packageInfo.name}@${packageInfo.version}`);
  console.log(`  Files count:   ${fileCount}`);
  console.log(`  Tarball size:  ${(tarballSize / 1024).toFixed(2)} KB`);
  console.log(`  Unpacked size: ${(unpackedSize / (1024 * 1024)).toFixed(2)} MB (${unpackedSize} bytes)`);
  console.log(`  Budget limit:  ${(MAX_UNPACKED_BYTES / (1024 * 1024)).toFixed(2)} MB`);

  if (unpackedSize > MAX_UNPACKED_BYTES) {
    console.error(`\n❌ FAILED: Unpacked size (${(unpackedSize / (1024 * 1024)).toFixed(2)} MB) exceeds 2 MB budget!`);
    process.exit(1);
  }

  console.log('\n✓ PASSED: Package size is well within the 2 MB budget target.');
  process.exit(0);
} catch (err) {
  console.error('Error running npm pack --dry-run:', err.message);
  process.exit(1);
}
