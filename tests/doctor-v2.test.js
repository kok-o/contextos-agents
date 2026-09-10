/**
 * tests/doctor-v2.test.js
 * Unit tests for Milestone 8 Doctor v2 Engine (.agents/doctor.js)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  STATUS,
  runDoctor,
  applyDoctorFix,
  checkNodeVersion,
  checkGitVersion,
  checkSecretScanner,
  checkTransactions,
  checkLockfileIntegrity,
} = require('../.agents/doctor.js');

describe('Milestone 8 — Doctor v2 Diagnostics Engine', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-doctor-test-'));

    // Create minimal valid .agents/ environment
    fs.mkdirSync(path.join(tmpDir, '.agents', 'core', 'skills', 'react'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.agents', 'core', 'skills', 'react', 'SKILL.md'),
      '---\nname: react\ndescription: React guidelines\n---\n# React\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.agents', 'AGENTS.md'), '# Project Operating System Rules\n');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'doctor-app' }));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('checkNodeVersion() validates Node 18 for Core and reports Node 20 status', () => {
    const res = checkNodeVersion();

    assert.ok([STATUS.PASS, STATUS.WARN].includes(res.status));
    assert.equal(res.ok, true);
    assert.ok(res.version.startsWith('v'));
  });

  test('checkGitVersion() verifies git availability', () => {
    const res = checkGitVersion();

    assert.equal(res.status, STATUS.PASS);
    assert.equal(res.ok, true);
    assert.ok(res.message.includes('git version'));
  });

  test('checkSecretScanner() returns WARN when scanner script is absent', () => {
    // In tmpDir, scripts/check-secrets.js is absent
    const res = checkSecretScanner(tmpDir);

    // Per Milestone 8 spec: "doctor не считает отсутствующий scanner PASS"
    assert.equal(res.status, STATUS.WARN);
    assert.equal(res.ok, false);
    assert.ok(res.message.includes('missing'));
    assert.ok(res.remediation.length > 0);
  });

  test('checkTransactions() detects uncommitted transactions and triggers RECOVERY_REQUIRED', () => {
    // Inject mock uncommitted transaction journal
    const txDir = path.join(tmpDir, '.agents', '.contextos', 'transactions', 'tx-broken-999');
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(
      path.join(txDir, 'journal.json'),
      JSON.stringify({
        txId: 'tx-broken-999',
        status: 'APPLYING', // uncommitted interrupted state
        startedAt: Date.now(),
        operations: [],
      })
    );

    const res = checkTransactions(tmpDir);

    assert.equal(res.status, STATUS.RECOVERY_REQUIRED);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('RECOVERY_REQUIRED'));
    assert.ok(res.remediation.includes('recover --list'));
  });

  test('runDoctor({ json: true }) outputs versioned schema 2.0.0 report', () => {
    const report = runDoctor(tmpDir, { json: true, exitOnError: false });

    assert.equal(report.schemaVersion, '2.0.0');
    assert.ok(['PASS', 'WARN', 'FAIL', 'RECOVERY_REQUIRED'].includes(report.status));
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.length >= 10);
    assert.ok(report.summary.total >= 10);
    assert.equal(typeof report.summary.pass, 'number');
    assert.equal(typeof report.summary.warn, 'number');
  });

  test('runDoctor({ strict: true }) converts warnings into overall FAIL status', () => {
    // tmpDir has warnings (e.g. missing lockfile / missing secret scanner)
    const report = runDoctor(tmpDir, { json: true, strict: true, exitOnError: false });

    assert.equal(report.status, STATUS.FAIL);
    assert.equal(report.ok, false);
  });

  test('applyDoctorFix() cleans completed stale transaction logs safely', () => {
    // Create an old completed transaction journal (age > 2 hours)
    const txDir = path.join(tmpDir, '.agents', '.contextos', 'transactions', 'tx-old-123');
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(
      path.join(txDir, 'journal.json'),
      JSON.stringify({
        txId: 'tx-old-123',
        status: 'COMMITTED',
        committedAt: Date.now() - 7200000, // 2 hours ago
      })
    );

    assert.ok(fs.existsSync(txDir));

    const fixMessages = applyDoctorFix(tmpDir);

    assert.ok(fixMessages.length > 0);
    assert.equal(fs.existsSync(txDir), false, 'Old completed transaction directory should be pruned');
  });
});
