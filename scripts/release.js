#!/usr/bin/env node

'use strict';

const { execSync, execFileSync } = require('child_process');
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
  run('npm test');

  // 4. Build MCP core
  const mcpDir = path.join(__dirname, '../contextos-mcp');
  run('npm run build', { cwd: mcpDir });
  run('npm run check:release-surface');

  // 5. Pack tarball
  console.log('\nPacking tarball...');
  const candidates = path.join(__dirname, '../scratch/release-candidate');
  fs.mkdirSync(candidates, { recursive: true });
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const cwd of [path.join(__dirname, '..'), mcpDir]) {
    const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', candidates], { cwd, encoding: 'utf8' }))[0];
    console.log(`Created: ${path.join(candidates, packed.filename)}`);
  }
  run('npm run check:consumer');

  console.log('\n[SUCCESS] Local smoke/build checks completed; release acceptance remains pending.');
  console.log('Next steps:');
  console.log(`1. Update CHANGELOG.md for v${version}`);
  console.log('2. Pack both packages and run npm run check:consumer and npm run check:migration.');
  console.log('3. Complete Windows/Linux/macOS CI and client pilot; see docs/R2_RELEASE_PREPARATION.md.');
  console.log('4. Bind archives/evidence to one revision, then make a separate publication decision.');
}

main();
