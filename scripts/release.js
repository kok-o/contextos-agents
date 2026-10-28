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
  run('node scripts/check-secrets.js --all --core-only');

  // 3. Tests
  run('npm run test:core');

  // 4. The core path never builds or selects the optional MCP package.
  run('npm run check:release-surface:core');

  // 5. Pack tarball
  console.log('\nPacking tarball...');
  const candidates = path.join(__dirname, '..', 'scratch', `release-candidate-${version}`);
  fs.mkdirSync(candidates, { recursive: true });
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const cwd of [path.join(__dirname, '..')]) {
    const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', candidates], { cwd, encoding: 'utf8' }))[0];
    console.log(`Created: ${path.join(candidates, packed.filename)}`);
  }
  execFileSync(process.execPath, [path.join(__dirname, 'check-release-install.cjs'), '--core-only', candidates], { stdio: 'inherit' });

  console.log('\n[SUCCESS] Local smoke/build checks completed; release acceptance remains pending.');
  console.log('Next steps:');
  console.log(`1. Update CHANGELOG.md for v${version}`);
  console.log('2. Run check:migration:core against previous core archives.');
  console.log('3. Complete Windows/Linux/macOS CI and client pilot; see docs/archive/R2_RELEASE_PREPARATION.md.');
  console.log('4. Bind the archive/evidence to one revision; see docs/RELEASE_PROCESS.md.');
}

main();
