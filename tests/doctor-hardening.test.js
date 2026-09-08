/**
 * tests/doctor-hardening.test.js
 * Tests for .agents/doctor.js health checking & failure containment
 * Uses Node.js built-in test runner (node:test) — zero external dependencies
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const {
  runDoctor,
  checkNodeVersion,
  checkLockfileIntegrity,
  checkAdapterIntegrity,
  checkSymlinks,
} = require('../.agents/doctor.js');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'index.js');

describe('doctor.js — Diagnostic Suite Hardening', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-doctor-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('checkNodeVersion accepts current environment', () => {
    const res = checkNodeVersion();
    assert.equal(res.ok, true);
    assert.ok(res.version.length > 0);
  });

  test('checkLockfileIntegrity handles missing, valid, and corrupted lockfiles', () => {
    const projectDir = path.join(tmpDir, 'lockfile-project');
    const agentsDir = path.join(projectDir, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    // 1. Missing lockfile
    const missing = checkLockfileIntegrity(projectDir);
    assert.equal(missing.ok, true);
    assert.equal(missing.exists, false);

    // 2. Corrupted JSON lockfile
    const lockPath = path.join(agentsDir, 'contextos.lock.json');
    fs.writeFileSync(lockPath, '{ broken json');
    const corrupted = checkLockfileIntegrity(projectDir);
    assert.equal(corrupted.ok, false);
    assert.equal(corrupted.isError, true);
    assert.ok(corrupted.error.includes('corrupted'));

    // 3. Invalid schema lockfile
    fs.writeFileSync(lockPath, JSON.stringify({ wrong: true }));
    const invalidSchema = checkLockfileIntegrity(projectDir);
    assert.equal(invalidSchema.ok, false);
    assert.ok(invalidSchema.error.includes('schemaVersion'));

    // 4. Valid lockfile
    fs.writeFileSync(lockPath, JSON.stringify({
      schemaVersion: 1,
      version: '1.6.1',
      managedFiles: { '.agents/AGENTS.md': 'hash123' },
    }));
    const valid = checkLockfileIntegrity(projectDir);
    assert.equal(valid.ok, true);
    assert.equal(valid.exists, true);
    assert.ok(valid.message.includes('valid'));
  });

  test('checkAdapterIntegrity detects 0-byte damaged adapter outputs', () => {
    const projectDir = path.join(tmpDir, 'adapter-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Create empty 0-byte .cursorrules file
    fs.writeFileSync(path.join(projectDir, '.cursorrules'), '');
    const res = checkAdapterIntegrity(projectDir);

    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => e.includes('.cursorrules') && e.includes('empty')));

    // Now populate file
    fs.writeFileSync(path.join(projectDir, '.cursorrules'), 'non-empty rule content\n');
    const resClean = checkAdapterIntegrity(projectDir);
    assert.equal(resClean.ok, true);
  });

  test('checkSymlinks detects broken symbolic links in .agents', (t) => {
    const projectDir = path.join(tmpDir, 'symlink-project');
    const agentsDir = path.join(projectDir, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const linkPath = path.join(agentsDir, 'broken-link');
    try {
      fs.symlinkSync(path.join(projectDir, 'non-existent-target.txt'), linkPath);
    } catch (e) {
      // Symlinks may require elevated privileges on some Windows configurations
      t.skip('Symlink creation not permitted in this environment');
      return;
    }

    const res = checkSymlinks(projectDir);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => e.includes('Broken symlink')));
  });

  test('runDoctor returns ok:false when .agents folder is missing', () => {
    const emptyDir = path.join(tmpDir, 'empty-missing-agents');
    fs.mkdirSync(emptyDir, { recursive: true });

    const report = runDoctor(emptyDir, { json: false, exitOnError: false });
    assert.equal(report.ok, false);
    assert.ok(report.errors.some(e => e.includes('.agents/ directory missing')));
  });

  test('contextos doctor --json exits with code 1 when .agents is missing', () => {
    const emptyDir = path.join(tmpDir, 'empty-test-dir');
    fs.mkdirSync(emptyDir, { recursive: true });

    assert.throws(
      () => execSync(`node "${BIN_PATH}" doctor --json`, { cwd: emptyDir, stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        const parsed = JSON.parse(err.stdout.toString());
        assert.equal(parsed.ok, false);
        assert.ok(parsed.errors.length > 0);
        return true;
      }
    );
  });
});
