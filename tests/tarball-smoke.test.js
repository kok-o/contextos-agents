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

  test('Tarball contains resolver, rules, and full catalog/skills distribution', () => {
    const pkgRoot = path.join(extractedPkgDir, 'package');
    assert.ok(
      fs.existsSync(path.join(pkgRoot, '.agents', 'resolver', 'canonical-resolver.js')),
      'Tarball must contain .agents/resolver/canonical-resolver.js'
    );
    assert.ok(
      fs.existsSync(path.join(pkgRoot, '.agents', 'rules', 'rule-catalog.js')),
      'Tarball must contain .agents/rules/rule-catalog.js'
    );
    assert.ok(
      fs.existsSync(path.join(pkgRoot, 'catalog', 'skills', 'security-audit', 'SKILL.md')),
      'Tarball must contain catalog/skills/security-audit/SKILL.md'
    );
    assert.ok(
      fs.existsSync(path.join(pkgRoot, 'catalog', 'skills', 'api-design', 'SKILL.md')),
      'Tarball must contain catalog/skills/api-design/SKILL.md'
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

    // Task 1.9: Verify gate and export check operate from unpacked tarball
    assert.ok(
      fs.existsSync(path.join(extractedPkgDir, 'package', 'bin', 'lib', 'gate.js')),
      'Tarball must contain bin/lib/gate.js'
    );

    let gateOutput = '';
    try {
      gateOutput = execSync(`node "${pkgBin}" gate --project "${consumerProjectDir}" --json`, {
        encoding: 'utf8',
      });
    } catch (err) {
      gateOutput = (err.stdout || '').toString();
    }
    const gateParsed = JSON.parse(gateOutput);
    assert.equal(gateParsed.schemaVersion, '2.0.0');
    assert.ok(gateParsed.status === 'pass' || gateParsed.status === 'drift');

    let exportCheckOutput = '';
    try {
      exportCheckOutput = execSync(`node "${pkgBin}" export all --check --project "${consumerProjectDir}" --json`, {
        encoding: 'utf8',
      });
    } catch (err) {
      exportCheckOutput = (err.stdout || '').toString();
    }
    const exportParsed = JSON.parse(exportCheckOutput);
    assert.equal(exportParsed.schemaVersion, '2.0.0');
  });

  test('Consumer project installs catalog skills directly from unpacked package', () => {
    const pkgBin = path.join(extractedPkgDir, 'package', 'bin', 'index.js');

    // Add security-audit skill from packaged catalog
    const addOutput = execSync(`node "${pkgBin}" skill add security-audit`, {
      cwd: consumerProjectDir,
      encoding: 'utf8',
    });
    assert.ok(addOutput.includes('security-audit'), 'Must log installed skill name');

    const installedSkill = path.join(consumerProjectDir, '.agents', 'plugins', 'security-audit', 'SKILL.md');
    assert.ok(fs.existsSync(installedSkill), 'security-audit skill must be written to consumer .agents/plugins');
    const content = fs.readFileSync(installedSkill, 'utf8');
    assert.ok(content.includes('security-audit'), 'Skill content must be preserved');
  });

  test('Parity: identical scan fixtures produce identical results between source CLI and tarball package CLI', () => {
    const pkgBin = path.join(extractedPkgDir, 'package', 'bin', 'index.js');
    const srcBin = path.join(REPO_ROOT, 'bin', 'index.js');

    const parityDir = path.join(tmpBase, 'parity-repo');
    fs.mkdirSync(parityDir, { recursive: true });

    // Initialize git repo in parityDir
    execSync('git init', { cwd: parityDir });
    execSync('git config user.name "ContextOS Tester"', { cwd: parityDir });
    execSync('git config user.email "test@contextos.dev"', { cwd: parityDir });
    fs.writeFileSync(path.join(parityDir, 'README.md'), '# Parity Repo\n');
    execSync('git add README.md', { cwd: parityDir });
    execSync('git commit -m "init"', { cwd: parityDir });

    // 1. Clean staged state parity
    const srcCleanOut = execSync(`node "${srcBin}" scan --staged --enforce --json`, {
      cwd: parityDir,
      encoding: 'utf8',
    });
    const pkgCleanOut = execSync(`node "${pkgBin}" scan --staged --enforce --json`, {
      cwd: parityDir,
      encoding: 'utf8',
    });

    const srcClean = JSON.parse(srcCleanOut);
    const pkgClean = JSON.parse(pkgCleanOut);

    assert.equal(srcClean.code, 0);
    assert.equal(pkgClean.code, 0);
    assert.equal(srcClean.ok, true);
    assert.equal(pkgClean.ok, true);
    assert.equal(srcClean.findings.length, 0);
    assert.equal(pkgClean.findings.length, 0);

    // 2. Injected secret violation parity
    const secretFile = path.join(parityDir, 'api_token.js');
    fs.writeFileSync(secretFile, 'const token = "sk-12345678901234567890123456789012";\n');
    execSync('git add api_token.js', { cwd: parityDir });

    let srcViolCode = 0;
    let srcViolOut = '';
    try {
      srcViolOut = execSync(`node "${srcBin}" scan --staged --enforce --json`, {
        cwd: parityDir,
        encoding: 'utf8',
      });
    } catch (err) {
      srcViolCode = err.status;
      srcViolOut = (err.stdout || '').toString();
    }

    let pkgViolCode = 0;
    let pkgViolOut = '';
    try {
      pkgViolOut = execSync(`node "${pkgBin}" scan --staged --enforce --json`, {
        cwd: parityDir,
        encoding: 'utf8',
      });
    } catch (err) {
      pkgViolCode = err.status;
      pkgViolOut = (err.stdout || '').toString();
    }

    assert.equal(srcViolCode, 1, 'Source CLI must exit code 1 on secret violation');
    assert.equal(pkgViolCode, 1, 'Package CLI must exit code 1 on secret violation');

    const srcViol = JSON.parse(srcViolOut);
    const pkgViol = JSON.parse(pkgViolOut);

    assert.equal(srcViol.findings.length, pkgViol.findings.length);
    assert.equal(srcViol.findings[0].ruleId, pkgViol.findings[0].ruleId);
    assert.equal(srcViol.findings[0].ruleId, 'SEC-006');

    // 3. Negative test parity: non-git directory returns code 2 with explicit diagnostic
    const nonGitParity = path.join(tmpBase, 'non-git-parity');
    fs.mkdirSync(nonGitParity, { recursive: true });

    let srcErrCode = 0;
    let srcErrOut = '';
    try {
      srcErrOut = execSync(`node "${srcBin}" scan --staged --enforce --json`, {
        cwd: nonGitParity,
        encoding: 'utf8',
      });
    } catch (err) {
      srcErrCode = err.status;
      srcErrOut = (err.stdout || '').toString();
    }

    let pkgErrCode = 0;
    let pkgErrOut = '';
    try {
      pkgErrOut = execSync(`node "${pkgBin}" scan --staged --enforce --json`, {
        cwd: nonGitParity,
        encoding: 'utf8',
      });
    } catch (err) {
      pkgErrCode = err.status;
      pkgErrOut = (err.stdout || '').toString();
    }

    assert.equal(srcErrCode, 2, 'Source CLI must exit code 2 when inspection cannot complete');
    assert.equal(pkgErrCode, 2, 'Package CLI must exit code 2 when inspection cannot complete');

    const srcErr = JSON.parse(srcErrOut);
    const pkgErr = JSON.parse(pkgErrOut);

    assert.ok(srcErr.error.includes('Not a Git repository'));
    assert.ok(pkgErr.error.includes('Not a Git repository'));
  });

  test('Real local npm install in consumer project verifies .bin/contextos CLI and pre-commit hook', () => {
    const realConsumerDir = path.join(tmpBase, 'real-npm-consumer');
    fs.mkdirSync(realConsumerDir, { recursive: true });

    // Minimal package.json
    fs.writeFileSync(
      path.join(realConsumerDir, 'package.json'),
      JSON.stringify({ name: 'consumer-real-test', version: '1.0.0', private: true }, null, 2),
      'utf8'
    );

    // Run real npm install of the packaged tgz
    execSync(`npm install --no-audit --no-fund --no-package-lock "${tgzPath}"`, {
      cwd: realConsumerDir,
      stdio: 'pipe',
    });

    // Check .bin link exists
    const binExt = process.platform === 'win32' ? '.cmd' : '';
    const localBin = path.join(realConsumerDir, 'node_modules', '.bin', `contextos${binExt}`);
    assert.ok(fs.existsSync(localBin), `Local binary must exist at ${localBin}`);

    // Check version output via installed binary
    const versionOut = execSync(`"${localBin}" --version`, {
      cwd: realConsumerDir,
      encoding: 'utf8',
    });
    const expectedVersion = require('../package.json').version;
    assert.ok(versionOut.includes(expectedVersion), `Installed binary must output version ${expectedVersion}, got: ${versionOut}`);

    // Initialize git and test hook install in real consumer project
    execSync('git init', { cwd: realConsumerDir });
    execSync('git config user.name "Consumer Tester"', { cwd: realConsumerDir });
    execSync('git config user.email "tester@consumer.dev"', { cwd: realConsumerDir });

    execSync(`"${localBin}" hook install`, { cwd: realConsumerDir });
    const hookFile = path.join(realConsumerDir, '.git', 'hooks', 'pre-commit');
    assert.ok(fs.existsSync(hookFile), 'Pre-commit hook must be created');

    const hookContent = fs.readFileSync(hookFile, 'utf8');
    assert.ok(hookContent.includes('./node_modules/.bin/contextos'), 'Hook must reference local runner');

    // Clean commit should pass through hook
    fs.writeFileSync(path.join(realConsumerDir, 'clean.txt'), 'clean content\n');
    execSync('git add clean.txt', { cwd: realConsumerDir });
    execSync('git commit -m "clean commit"', { cwd: realConsumerDir });

    // Staged secret must be blocked by hook
    fs.writeFileSync(path.join(realConsumerDir, 'secret.js'), 'const key = "sk-12345678901234567890123456789012";\n');
    execSync('git add secret.js', { cwd: realConsumerDir });
    let commitBlocked = false;
    try {
      execSync('git commit -m "blocked commit"', {
        cwd: realConsumerDir,
        stdio: 'pipe',
      });
    } catch (err) {
      commitBlocked = true;
    }
    assert.ok(commitBlocked, 'Commit with secret must be blocked by installed pre-commit hook');
  });
});
