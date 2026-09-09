/**
 * tests/plugin-supply-chain.test.js
 * ContextOS — Plugin Supply Chain Security Test Suite
 *
 * Verifies Milestone 15 (Issue #19):
 *   - Deterministic full-tree digest calculation (Section 20.3)
 *   - Safe archive extraction scanner (Section 20.4)
 *   - Source pinning enforcement (Git commit SHA, npm integrity) (Section 20.1)
 *   - Script execution capability grants & hash invalidation (Section 20.6)
 *   - Atomic plugin updates and local modification protection (Section 20.7)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  calculateTreeDigest,
  validateArchiveEntry,
  validatePluginPinning,
  ScriptGrantManager,
  AtomicPluginUpdater,
} = require('../.agents/plugin-supply-chain');

function createTempDir(prefix = 'ctx-supply-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('calculateTreeDigest — deterministic full-tree hashing and sensitivity', (t) => {
  const tmpDir = createTempDir('digest-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // Create plugin structure
  fs.mkdirSync(path.join(tmpDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Skill Title\n', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'references', 'guide.md'), 'Reference guide\n', 'utf8');

  const digest1 = calculateTreeDigest(tmpDir);
  assert.ok(digest1.treeDigest && digest1.treeDigest.length === 64, 'Digest must be a 64-char sha256');
  assert.equal(digest1.files.length, 2);

  // Determinism check: recalculating without modifications yields identical hash
  const digest2 = calculateTreeDigest(tmpDir);
  assert.equal(digest1.treeDigest, digest2.treeDigest);

  // Modification sensitivity check: altering 1 file changes treeDigest
  fs.appendFileSync(path.join(tmpDir, 'references', 'guide.md'), 'Extra text\n', 'utf8');
  const digest3 = calculateTreeDigest(tmpDir);
  assert.notEqual(digest1.treeDigest, digest3.treeDigest);
});

test('validateArchiveEntry — blocks directory traversal, absolute paths, and Windows device names', () => {
  // Traversal attacks
  assert.equal(validateArchiveEntry('../../etc/shadow').valid, false);
  assert.equal(validateArchiveEntry('sub/../../evil.js').valid, false);

  // Absolute paths
  assert.equal(validateArchiveEntry('/usr/local/bin/run').valid, false);
  assert.equal(validateArchiveEntry('C:\\Windows\\System32\\cmd.exe').valid, false);

  // Windows reserved device names
  assert.equal(validateArchiveEntry('con.txt').valid, false);
  assert.equal(validateArchiveEntry('dir/NUL').valid, false);
  assert.equal(validateArchiveEntry('AUX.js').valid, false);
  assert.equal(validateArchiveEntry('com1.dat').valid, false);

  // Zip bomb limits
  assert.equal(
    validateArchiveEntry('file.txt', { currentCount: 100, maxFiles: 100 }).code,
    'CTX_ARCHIVE_MAX_FILES_EXCEEDED'
  );
  assert.equal(
    validateArchiveEntry('file.txt', { currentTotalBytes: 5000, maxTotalBytes: 4000 }).code,
    'CTX_ARCHIVE_MAX_SIZE_EXCEEDED'
  );

  // Clean paths
  assert.equal(validateArchiveEntry('SKILL.md').valid, true);
  assert.equal(validateArchiveEntry('references/tutorial.md').valid, true);
  assert.equal(validateArchiveEntry('scripts/build.js').valid, true);
});

test('validatePluginPinning — enforces exact commit SHAs and npm integrity', () => {
  // GitHub floating branch/tag blocked by default
  const floatingGithub = validatePluginPinning({ type: 'github', commit: 'main' });
  assert.equal(floatingGithub.valid, false);
  assert.equal(floatingGithub.code, 'CTX_PLUGIN_FLOATING_SOURCE_BLOCKED');

  // GitHub floating allowed with flag
  const floatingAllowed = validatePluginPinning({ type: 'github', commit: 'main' }, { allowFloating: true });
  assert.equal(floatingAllowed.valid, true);

  // GitHub pinned to 40-char commit SHA
  const pinnedGithub = validatePluginPinning({
    type: 'github',
    commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  });
  assert.equal(pinnedGithub.valid, true);

  // npm range or latest blocked
  assert.equal(validatePluginPinning({ type: 'npm', version: 'latest' }).code, 'CTX_PLUGIN_IMPLICIT_LATEST_BLOCKED');
  assert.equal(validatePluginPinning({ type: 'npm', version: '^2.0.0' }).code, 'CTX_PLUGIN_IMPLICIT_LATEST_BLOCKED');

  // npm missing integrity
  assert.equal(validatePluginPinning({ type: 'npm', version: '1.2.3' }).code, 'CTX_PLUGIN_MISSING_INTEGRITY');

  // npm valid pinned version and integrity
  const validNpm = validatePluginPinning({
    type: 'npm',
    version: '1.2.3',
    integrity: 'sha512-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  });
  assert.equal(validNpm.valid, true);
});

test('ScriptGrantManager — capability grants and modification invalidation', (t) => {
  const tmpDir = createTempDir('grants-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const scriptPath = path.join(tmpDir, 'deploy.js');
  fs.writeFileSync(scriptPath, 'console.log("Safe deploy");\n', 'utf8');

  const grantsFile = path.join(tmpDir, 'grants.json');
  const manager = new ScriptGrantManager(grantsFile);

  // 1. Initial check without grant: blocked
  const beforeGrant = manager.checkAuthorization(scriptPath);
  assert.equal(beforeGrant.authorized, false);

  // 2. Issue grant
  manager.grant(scriptPath);
  const afterGrant = manager.checkAuthorization(scriptPath);
  assert.equal(afterGrant.authorized, true);

  // 3. Modifying script invalidates authorization
  fs.appendFileSync(scriptPath, 'console.log("Malicious injection");\n', 'utf8');
  const afterModification = manager.checkAuthorization(scriptPath);
  assert.equal(afterModification.authorized, false);
  assert.ok(afterModification.reason.includes('modified since grant was issued'));
});

test('AtomicPluginUpdater — preserves local modifications and performs atomic update', (t) => {
  const tmpDir = createTempDir('updater-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const targetPlugin = path.join(tmpDir, 'my-plugin');
  const stagedDir = path.join(tmpDir, 'staged-v2');

  // Initial installation (v1)
  fs.mkdirSync(targetPlugin, { recursive: true });
  fs.writeFileSync(path.join(targetPlugin, 'SKILL.md'), '# v1\n', 'utf8');
  const initialDigest = calculateTreeDigest(targetPlugin).treeDigest;

  // Staged update (v2)
  fs.mkdirSync(stagedDir, { recursive: true });
  fs.writeFileSync(path.join(stagedDir, 'SKILL.md'), '# v2\n', 'utf8');

  // Simulate local user modification in target plugin
  fs.writeFileSync(path.join(targetPlugin, 'CUSTOM_RULE.md'), '# My custom policy\n', 'utf8');

  // Attempt update without force: must reject with CTX_PLUGIN_MODIFIED_LOCALLY
  assert.throws(
    () => {
      AtomicPluginUpdater.applyUpdate(targetPlugin, stagedDir, {
        expectedOldTreeDigest: initialDigest,
        force: false,
      });
    },
    { code: 'CTX_PLUGIN_MODIFIED_LOCALLY' }
  );

  // Target still has the custom rule
  assert.equal(fs.existsSync(path.join(targetPlugin, 'CUSTOM_RULE.md')), true);

  // Force update succeeds and swaps directories
  const result = AtomicPluginUpdater.applyUpdate(targetPlugin, stagedDir, {
    expectedOldTreeDigest: initialDigest,
    force: true,
  });

  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(path.join(targetPlugin, 'SKILL.md'), 'utf8'), '# v2\n');
});
