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
  const coreOnly = process.argv.includes('--core-only');
  if (version.includes('-') && !coreOnly) {
    throw new Error('Prerelease preparation requires --core-only; the stable paired publisher is not used.');
  }
  console.log(`Preparing release for v${version}...`);

  // 1. Full check
  run('node .agents/ctx.js compile --check');
  run('node .agents/ctx.js export all --check');
  run('node .agents/ctx.js doctor --strict');
  
  // 2. Secret scan
  run('node scripts/check-secrets.js --all');

  // 3. Tests
  run(coreOnly ? 'npm run test:core' : 'npm test');

  // 4. Build the optional companion and check the selected package surfaces
  const mcpDir = path.join(__dirname, '../contextos-mcp');
  if (!coreOnly) run('npm run build', { cwd: mcpDir });
  run(coreOnly ? 'npm run check:release-surface:core' : 'npm run check:release-surface');

  // 5. Pack tarball
  console.log('\nPacking tarball...');
  const candidates = path.join(__dirname, '..', 'scratch', coreOnly ? `release-candidate-${version}` : 'release-candidate');
  fs.mkdirSync(candidates, { recursive: true });
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const cwd of [path.join(__dirname, '..'), ...(!coreOnly ? [mcpDir] : [])]) {
    const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', candidates], { cwd, encoding: 'utf8' }))[0];
    console.log(`Created: ${path.join(candidates, packed.filename)}`);
  }
  execFileSync(process.execPath, [path.join(__dirname, 'check-release-install.cjs'), ...(coreOnly ? ['--core-only'] : []), candidates], { stdio: 'inherit' });

  console.log('\n[SUCCESS] Local smoke/build checks completed; release acceptance remains pending.');
  console.log('Next steps:');
  console.log(`1. Update CHANGELOG.md for v${version}`);
  console.log(coreOnly ? '2. Run check:migration:core against previous core archives.' : '2. Pack both packages and run npm run check:consumer and npm run check:migration.');
  console.log('3. Complete Windows/Linux/macOS CI and client pilot; see docs/archive/R2_RELEASE_PREPARATION.md.');
  console.log('4. Bind archives/evidence to one revision, then make a separate publication decision.');
}

main();
