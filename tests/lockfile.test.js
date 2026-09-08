/**
 * tests/lockfile.test.js
 * Unit tests for bin/lib/lockfile.js (Task 1.1)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  computeHash,
  computeFileHash,
  createLockfileData,
  recordManagedFile,
  loadLockfile,
  saveLockfile,
  isManagedFile,
  isFileModified,
  classifyFile,
  migrateExistingInstallation,
  LOCKFILE_REL_PATH,
} = require('../bin/lib/lockfile.js');

describe('bin/lib/lockfile.js — Lockfile Engine & Provenance Tracking', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-lockfile-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('computeHash normalizes CRLF and LF to produce consistent SHA-256', () => {
    const textLf = 'export const test = 1;\nconsole.log(test);\n';
    const textCrlf = 'export const test = 1;\r\nconsole.log(test);\r\n';

    const hashLf = computeHash(textLf);
    const hashCrlf = computeHash(textCrlf);

    assert.equal(typeof hashLf, 'string');
    assert.equal(hashLf.length, 64);
    assert.equal(hashLf, hashCrlf, 'LF and CRLF must yield the exact same SHA-256');
  });

  test('createLockfileData initializes a valid schemaVersion: 1 lockfile structure', () => {
    const data = createLockfileData({
      installedPackage: 'contextos-agents',
      version: '1.6.1',
      selectedProfile: 'startup',
    });

    assert.equal(data.schemaVersion, 1);
    assert.equal(data.installedPackage, 'contextos-agents');
    assert.equal(data.version, '1.6.1');
    assert.equal(data.selectedProfile, 'startup');
    assert.ok(data.installedAt);
    assert.deepEqual(data.managedFiles, {});
  });

  test('recordManagedFile normalizes path slashes and stores sha256', () => {
    const lock = createLockfileData();
    recordManagedFile(lock, '.agents\\core\\skills\\react\\SKILL.md', '# React Skill\n');

    assert.ok(lock.managedFiles['.agents/core/skills/react/SKILL.md']);
    assert.equal(lock.managedFiles['.agents/core/skills/react/SKILL.md'].managed, true);
    assert.equal(lock.managedFiles['.agents/core/skills/react/SKILL.md'].sha256, computeHash('# React Skill\n'));
  });

  test('saveLockfile and loadLockfile round-trip atomically', () => {
    const lock = createLockfileData({ version: '2.0.0' });
    recordManagedFile(lock, '.agents/ctx.js', 'console.log("ctx");\n');

    saveLockfile(tmpDir, lock);

    const loaded = loadLockfile(tmpDir);
    assert.ok(loaded);
    assert.equal(loaded.schemaVersion, 1);
    assert.equal(loaded.version, '2.0.0');
    assert.equal(loaded.managedFiles['.agents/ctx.js'].managed, true);
  });

  test('loadLockfile returns null when lockfile does not exist', () => {
    const loaded = loadLockfile(tmpDir);
    assert.equal(loaded, null);
  });

  test('isManagedFile handles path separators transparently', () => {
    const lock = createLockfileData();
    recordManagedFile(lock, '.agents/core/skills/testing/SKILL.md', 'content');

    assert.equal(isManagedFile(lock, '.agents/core/skills/testing/SKILL.md'), true);
    assert.equal(isManagedFile(lock, '.agents\\core\\skills\\testing\\SKILL.md'), true);
    assert.equal(isManagedFile(lock, '.agents/custom-skill/SKILL.md'), false);
  });

  test('isFileModified detects clean vs modified files on disk', () => {
    const lock = createLockfileData();
    const relFile = '.agents/test-skill.md';
    const originalContent = 'initial content\n';

    recordManagedFile(lock, relFile, originalContent);

    const fullPath = path.join(tmpDir, relFile);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, originalContent);

    assert.equal(isFileModified(tmpDir, relFile, lock), false);

    // User modifies file
    fs.writeFileSync(fullPath, 'user modified content\n');
    assert.equal(isFileModified(tmpDir, relFile, lock), true);

    // Unmanaged file is not classified as modified
    assert.equal(isFileModified(tmpDir, '.agents/unmanaged.txt', lock), false);
  });

  test('classifyFile classifies files into accurate lifecycle states', () => {
    const lock = createLockfileData();
    recordManagedFile(lock, '.agents/clean.txt', 'clean\n');
    recordManagedFile(lock, '.agents/modified.txt', 'clean\n');
    recordManagedFile(lock, '.agents/missing.txt', 'clean\n');

    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.agents', 'clean.txt'), 'clean\n');
    fs.writeFileSync(path.join(tmpDir, '.agents', 'modified.txt'), 'changed by user\n');
    fs.writeFileSync(path.join(tmpDir, '.agents', 'custom.txt'), 'user created\n');

    assert.equal(classifyFile(tmpDir, '.agents/clean.txt', lock), 'MANAGED_CLEAN');
    assert.equal(classifyFile(tmpDir, '.agents/modified.txt', lock), 'MANAGED_MODIFIED');
    assert.equal(classifyFile(tmpDir, '.agents/missing.txt', lock), 'MISSING');
    assert.equal(classifyFile(tmpDir, '.agents/custom.txt', lock), 'UNMANAGED');
  });

  test('migrateExistingInstallation claims only distribution-matching files and preserves user custom files', () => {
    const sourceDir = path.join(tmpDir, 'source', '.agents');
    const targetDir = path.join(tmpDir, 'target');
    const targetAgents = path.join(targetDir, '.agents');

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetAgents, { recursive: true });

    // Source distribution files
    fs.writeFileSync(path.join(sourceDir, 'ctx.js'), 'ctx v1\n');
    fs.writeFileSync(path.join(sourceDir, 'rule.md'), 'standard rule\n');

    // Target installation
    fs.writeFileSync(path.join(targetAgents, 'ctx.js'), 'ctx v1\n'); // clean match
    fs.writeFileSync(path.join(targetAgents, 'rule.md'), 'user customized rule\n'); // modified
    fs.writeFileSync(path.join(targetAgents, 'my-skill.md'), 'my custom skill\n'); // user created

    const lock = migrateExistingInstallation(targetDir, sourceDir, {
      version: '1.6.1',
      selectedProfile: 'default',
    });

    assert.ok(lock);
    assert.ok(lock.managedFiles['.agents/ctx.js']);
    assert.equal(lock.managedFiles['.agents/ctx.js'].managed, true);

    // Modified and custom files must NOT be claimed as managed
    assert.equal(lock.managedFiles['.agents/rule.md'], undefined);
    assert.equal(lock.managedFiles['.agents/my-skill.md'], undefined);

    // Lockfile was saved to target
    const onDisk = loadLockfile(targetDir);
    assert.ok(onDisk);
    assert.equal(onDisk.managedFiles['.agents/ctx.js'].managed, true);
  });
});
