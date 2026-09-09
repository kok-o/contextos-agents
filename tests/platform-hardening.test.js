/**
 * tests/platform-hardening.test.js
 * ContextOS — Cross-Platform Hardening Test Suite
 *
 * Verifies Milestone 16 (Issue #20):
 *   - UNC and network share path detection (Section 21.5)
 *   - Node.js runtime and platform support validation (Section 21.1)
 *   - Platform-aware repository fingerprinting with persisted UUID (Section 21.6)
 *   - Windows file lock contention retry helpers (safeRenameSync, safeUnlinkSync) (Section 21.2)
 *   - Unicode NFC standard normalization (Section 21.4)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  isNetworkOrUNCPath,
  validatePlatformSupport,
  calculateRepositoryFingerprint,
  normalizeUnicodeNFC,
  safeRenameSync,
  safeUnlinkSync,
} = require('../.agents/filesystem/platform-hardening');

function createTempDir(prefix = 'ctx-platform-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('isNetworkOrUNCPath — detects unsupported network shares and UNC paths', () => {
  // UNC paths
  assert.equal(isNetworkOrUNCPath('//storage.corp/repo'), true);
  assert.equal(isNetworkOrUNCPath('\\\\server\\share\\project'), true);
  assert.equal(isNetworkOrUNCPath('\\\\?\\UNC\\192.168.1.5\\share'), true);

  // Supported local paths
  assert.equal(isNetworkOrUNCPath('C:\\Users\\dev\\project'), false);
  assert.equal(isNetworkOrUNCPath('/home/dev/project'), false);
  assert.equal(isNetworkOrUNCPath('./relative/path'), false);
});

test('validatePlatformSupport — validates minimum Node versions for Core and Runtime', () => {
  const coreCheck = validatePlatformSupport({ component: 'core' });
  assert.equal(coreCheck.supported, true, 'Current Node.js environment must support Core (>= 18)');
  assert.equal(coreCheck.required, 18);

  const runtimeCheck = validatePlatformSupport({ component: 'runtime' });
  assert.equal(runtimeCheck.required, 20);
});

test('calculateRepositoryFingerprint — generates and persists repo-id with consistent hash', (t) => {
  const tmpDir = createTempDir('fingerprint-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const fp1 = calculateRepositoryFingerprint(tmpDir);
  assert.ok(fp1 && fp1.length === 64, 'Fingerprint must be a 64-char SHA256 string');

  // Verify repo-id file was created
  const repoIdFile = path.join(tmpDir, '.agents', '.contextos', 'repo-id');
  assert.equal(fs.existsSync(repoIdFile), true, 'repo-id must be persisted');
  const repoId = fs.readFileSync(repoIdFile, 'utf8').trim();
  assert.ok(repoId.length > 0);

  // Subsequent call on same directory must yield identical fingerprint
  const fp2 = calculateRepositoryFingerprint(tmpDir);
  assert.equal(fp1, fp2);
});

test('safeRenameSync and safeUnlinkSync — resilient file operations with cleanup', (t) => {
  const tmpDir = createTempDir('fs-resilience-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const fileA = path.join(tmpDir, 'file-a.txt');
  const fileB = path.join(tmpDir, 'file-b.txt');

  fs.writeFileSync(fileA, 'Initial data\n', 'utf8');

  // safeRenameSync
  const renamed = safeRenameSync(fileA, fileB);
  assert.equal(renamed, true);
  assert.equal(fs.existsSync(fileA), false);
  assert.equal(fs.existsSync(fileB), true);

  // safeUnlinkSync
  const unlinked = safeUnlinkSync(fileB);
  assert.equal(unlinked, true);
  assert.equal(fs.existsSync(fileB), false);

  // Unlinking non-existent file is idempotent
  assert.equal(safeUnlinkSync(fileB), true);
});

test('normalizeUnicodeNFC — standardizes Unicode characters across APFS and Linux', () => {
  // 'e' followed by combining acute accent U+0301 (NFD)
  const nfd = 'e\u0301';
  // Precomposed 'é' U+00E9 (NFC)
  const nfc = '\u00e9';

  assert.notEqual(nfd, nfc, 'Raw NFD and NFC string representation differs');
  assert.equal(normalizeUnicodeNFC(nfd), nfc, 'Normalized string must equal NFC');
});
