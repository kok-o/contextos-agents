#!/usr/bin/env node

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (err) {
    console.error(`\n[ERROR] Command failed: ${cmd}`);
    process.exit(1);
  }
}

function main() {
  console.log('ContextOS — Release Candidate Smoke Test & Build');

  const version = JSON.parse(fs.readFileSync('package.json', 'utf-8')).version;
  console.log(`Preparing release for v${version}...`);

  // 1. Full check
  run('node .agents/ctx.js compile --check');
  run('node .agents/ctx.js export all --check');
  run('node .agents/ctx.js doctor --strict');
  
  // 2. Secret scan
  run('node scripts/check-secrets.js --all');

  // 3. Tests
  run('node --test --test-concurrency=1 tests/*.test.js');

  // 4. Build MCP core
  const mcpDir = path.join(__dirname, '../contextos-mcp');
  run('npm run build', { cwd: mcpDir });

  // 5. Pack tarball
  console.log('\nPacking tarball...');
  const packOutput = execSync('npm pack', { encoding: 'utf-8' }).trim();
  console.log(`Created: ${packOutput}`);

  console.log('\n[SUCCESS] Release Candidate is ready.');
  console.log('Next steps:');
  console.log(`1. Update CHANGELOG.md for v${version}`);
  console.log(`2. Test tarball in empty directory: npm i -g ${packOutput}`);
  console.log(`3. Finalize CONTEXTOS_COMPLETION_PLAN.md to DONE`);
}

main();
