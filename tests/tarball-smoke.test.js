/**
 * tests/tarball-smoke.test.js
 * Consumer Pack-and-Install Smoke Test for ContextOS Core.
 *
 * Verifies:
 * 1. npm pack generates valid distribution tarball.
 * 2. Tarball includes essential directories (.agents/resolver, .agents/rules).
 * 3. Tarball installer (bin/index.js init) succeeds in a clean consumer directory.
 * 4. Post-install commands (resolve, compile, validate) execute without MODULE_NOT_FOUND.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

describe('Consumer Tarball Smoke Test', () => {
  let tmpBase;
  let tgzPath;
  let extractedPkgDir;
  let consumerProjectDir;

  before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-smoke-'));
    extractedPkgDir = path.join(tmpBase, 'pkg');
    consumerProjectDir = path.join(tmpBase, 'consumer-app');

    fs.mkdirSync(extractedPkgDir, { recursive: true });
    fs.mkdirSync(consumerProjectDir, { recursive: true });

    // 1. Pack root project into tarball
    const packOutput = execSync('npm pack', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const tgzFileName = packOutput.split('\n').filter(Boolean).pop().trim();
    tgzPath = path.join(REPO_ROOT, tgzFileName);

    assert.ok(fs.existsSync(tgzPath), `Tarball must exist: ${tgzPath}`);

    // 2. Extract tarball to extractedPkgDir
    execSync(`tar -xzf "${tgzPath}" -C "${extractedPkgDir}"`, { stdio: 'pipe' });
  });

  after(() => {
    // Cleanup generated tgz and temp directories
    if (tgzPath && fs.existsSync(tgzPath)) {
      try {
        fs.unlinkSync(tgzPath);
      } catch {}
    }
    if (tmpBase && fs.existsSync(tmpBase)) {
      try {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      } catch {}
    }
  });

  test('Tarball contains resolver and rules packages', () => {
    const pkgRoot = path.join(extractedPkgDir, 'package');
    assert.ok(
      fs.existsSync(path.join(pkgRoot, '.agents', 'resolver', 'canonical-resolver.js')),
      'Tarball must contain .agents/resolver/canonical-resolver.js'
    );
    assert.ok(
      fs.existsSync(path.join(pkgRoot, '.agents', 'rules', 'rule-catalog.js')),
      'Tarball must contain .agents/rules/rule-catalog.js'
    );
  });

  test('Clean install and execution of core commands in consumer project', () => {
    const pkgBin = path.join(extractedPkgDir, 'package', 'bin', 'index.js');

    // Initialize in clean consumer project
    const initOutput = execSync(`node "${pkgBin}" init --minimal`, {
      cwd: consumerProjectDir,
      encoding: 'utf8',
    });
    assert.ok(
      initOutput.includes('[OK]') || initOutput.includes('Next steps:'),
      'Init command should succeed and print confirmation'
    );

    const ctxPath = path.join(consumerProjectDir, '.agents', 'ctx.js');
    assert.ok(fs.existsSync(ctxPath), 'Consumer project must have .agents/ctx.js');

    // Verify resolve executes successfully
    const resolveOutput = execSync(`node "${ctxPath}" resolve "Implement user login"`, {
      cwd: consumerProjectDir,
      encoding: 'utf8',
    });
    assert.ok(
      resolveOutput.includes('Skills loaded:') || resolveOutput.includes('Dynamic Skill Resolution'),
      'Resolve should output loaded skills'
    );
    assert.ok(!resolveOutput.includes('MODULE_NOT_FOUND'), 'Resolve must not fail with MODULE_NOT_FOUND');

    // Verify compile executes successfully
    const compileOutput = execSync(`node "${ctxPath}" compile`, {
      cwd: consumerProjectDir,
      encoding: 'utf8',
    });
    assert.ok(!compileOutput.includes('Cannot find module'), 'Compile must not throw MODULE_NOT_FOUND');

    // Verify validate executes without missing module errors
    const validateOutput = execSync(`node "${ctxPath}" validate`, {
      cwd: consumerProjectDir,
      encoding: 'utf8',
    });
    assert.ok(!validateOutput.includes('Cannot find module'), 'Validate must not throw MODULE_NOT_FOUND');
  });
});
