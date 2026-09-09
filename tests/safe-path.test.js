/**
 * tests/safe-path.test.js
 * Test suite for resolveManagedPath and filesystem containment primitives
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  resolveManagedPath,
  SafePathError,
  SAFE_PATH_ERRORS,
  toPosix,
  isReservedDeviceName,
} = require('../.agents/filesystem/index.js');

describe('safe-path.js — Safe Path Primitive & Containment Guards', () => {
  const tmpRoot = path.join(os.tmpdir(), `ctx-safepath-test-${Date.now()}`);

  it('correctly resolves and normalizes valid relative paths', () => {
    const result = resolveManagedPath(tmpRoot, 'src/components/Button.tsx', { checkRealpathAncestors: false });
    assert.strictEqual(result.relativePosixPath, 'src/components/Button.tsx');
    assert.strictEqual(result.resolvedPath, path.resolve(tmpRoot, 'src/components/Button.tsx'));
  });

  it('rejects path traversal attempts with ..', () => {
    assert.throws(
      () => resolveManagedPath(tmpRoot, '../outside.txt', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.OUTSIDE_PROJECT
    );

    assert.throws(
      () => resolveManagedPath(tmpRoot, 'foo/../../bar.txt', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.OUTSIDE_PROJECT
    );
  });

  it('rejects absolute paths', () => {
    const absPath = path.resolve('/etc/passwd');
    assert.throws(
      () => resolveManagedPath(tmpRoot, absPath, { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.OUTSIDE_PROJECT
    );
  });

  it('rejects drive-qualified paths', () => {
    assert.throws(
      () => resolveManagedPath(tmpRoot, 'C:\\Windows\\System32', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.OUTSIDE_PROJECT
    );
    assert.throws(
      () => resolveManagedPath(tmpRoot, 'D:relative-drive-path', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.OUTSIDE_PROJECT
    );
  });

  it('rejects UNC network paths', () => {
    assert.throws(
      () => resolveManagedPath(tmpRoot, '\\\\server\\share\\exploit.txt', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.OUTSIDE_PROJECT
    );
  });

  it('rejects NUL bytes and empty paths', () => {
    assert.throws(
      () => resolveManagedPath(tmpRoot, 'file\0.txt', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.INVALID
    );

    assert.throws(
      () => resolveManagedPath(tmpRoot, '', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.INVALID
    );
  });

  it('rejects Alternate Data Streams (ADS) colon syntax', () => {
    assert.throws(
      () => resolveManagedPath(tmpRoot, 'secrets.txt:hidden_stream', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.INVALID
    );
  });

  it('rejects Windows reserved device names in path segments', () => {
    const reservedSamples = ['CON', 'con.txt', 'PRN', 'AUX', 'aux.json', 'NUL', 'COM1', 'com3.log', 'LPT1'];
    for (const name of reservedSamples) {
      assert.throws(
        () => resolveManagedPath(tmpRoot, `nested/${name}`, { checkRealpathAncestors: false }),
        (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.RESERVED_DEVICE,
        `Should reject reserved device name: ${name}`
      );
    }
  });

  it('rejects targeting the root project directory itself', () => {
    assert.throws(
      () => resolveManagedPath(tmpRoot, '.', { checkRealpathAncestors: false }),
      (err) => err instanceof SafePathError && err.code === SAFE_PATH_ERRORS.INVALID
    );
  });

  it('toPosix converts backslashes to slashes', () => {
    assert.strictEqual(toPosix('foo\\bar\\baz.ts'), 'foo/bar/baz.ts');
  });

  it('isReservedDeviceName correctly identifies device identifiers', () => {
    assert.strictEqual(isReservedDeviceName('CON'), true);
    assert.strictEqual(isReservedDeviceName('con.md'), true);
    assert.strictEqual(isReservedDeviceName('LPT9'), true);
    assert.strictEqual(isReservedDeviceName('console.ts'), false);
    assert.strictEqual(isReservedDeviceName('valid-name.js'), false);
  });
});
