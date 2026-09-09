/**
 * tests/journaled-transaction.test.js
 * Test suite for JournaledTransaction, crash resilience, and LockfileV2 manager
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  JournaledTransaction,
  TX_STATES,
  TransactionError,
  TX_ERRORS,
  LockfileV2Manager,
  computeExactHash,
  computeSemanticHash,
  LockfileV2Error,
  LOCKFILE_ERRORS,
} = require('../.agents/filesystem/index.js');

describe('journaled-transaction.js — Crash-Resilient Multi-File Mutations', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `ctx-tx-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  });

  it('stages, prepares, and cleanly commits multiple file modifications', () => {
    const tx = new JournaledTransaction(tmpRoot);

    tx.stageWrite('rules/rule-a.md', '# Rule A Content\n');
    tx.stageWrite('rules/rule-b.md', '# Rule B Content\n');

    assert.strictEqual(tx.state, TX_STATES.PLANNED);

    const result = tx.commit();
    assert.strictEqual(result.status, 'COMMITTED');
    assert.strictEqual(result.appliedCount, 2);

    const fileA = path.join(tmpRoot, 'rules', 'rule-a.md');
    const fileB = path.join(tmpRoot, 'rules', 'rule-b.md');

    assert.ok(fs.existsSync(fileA));
    assert.ok(fs.existsSync(fileB));
    assert.strictEqual(fs.readFileSync(fileA, 'utf8'), '# Rule A Content\n');
    assert.strictEqual(fs.readFileSync(fileB, 'utf8'), '# Rule B Content\n');
  });

  it('aborts and rolls back when expectedBeforeHash precondition fails', () => {
    const targetPath = path.join(tmpRoot, 'src', 'config.json');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, '{"version": 1}', 'utf8');

    const tx = new JournaledTransaction(tmpRoot);
    const wrongHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

    tx.stageWrite('src/config.json', '{"version": 2}', { expectedBeforeHash: wrongHash });

    assert.throws(
      () => tx.commit(),
      (err) => err instanceof TransactionError && err.code === TX_ERRORS.PRECONDITION_FAILED
    );

    // Target remains untouched
    assert.strictEqual(fs.readFileSync(targetPath, 'utf8'), '{"version": 1}');
  });

  it('reverts all applied modifications if an error occurs during multi-file apply', () => {
    const existingFile = path.join(tmpRoot, 'doc.md');
    fs.writeFileSync(existingFile, 'ORIGINAL CONTENT', 'utf8');

    const tx = new JournaledTransaction(tmpRoot);
    tx.stageWrite('doc.md', 'NEW CONTENT');

    // Manually force a failure by sabotaging the second operation's staged file
    tx.prepare();
    tx.operations.push({
      type: 'write',
      relativePath: 'fail.md',
      resolvedPath: path.join(tmpRoot, 'fail.md'),
      stagedFilePath: path.join(tmpRoot, 'non-existent-staging-file.tmp'), // Will throw ENOENT
      afterHash: 'sha256:abc',
      expectedBeforeHash: null,
    });

    assert.throws(
      () => tx.commit(),
      (err) => err instanceof TransactionError && err.code === TX_ERRORS.APPLY_FAILED
    );

    // Existing file must be restored back to ORIGINAL CONTENT
    assert.strictEqual(fs.readFileSync(existingFile, 'utf8'), 'ORIGINAL CONTENT');
  });

  it('stages and cleanly executes file deletions', () => {
    const toDelete = path.join(tmpRoot, 'obsolete.txt');
    fs.writeFileSync(toDelete, 'DELETE ME', 'utf8');

    const tx = new JournaledTransaction(tmpRoot);
    tx.stageDelete('obsolete.txt');
    tx.commit();

    assert.strictEqual(fs.existsSync(toDelete), false);
  });
});

describe('lockfile-v2.js — Lockfile v2 Schema Manager & Dual Hashing', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `ctx-lockfile-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  });

  it('dual hashing computes exact byte hash and CRLF-normalized semantic hash', () => {
    const crlfContent = 'line1\r\nline2\r\n';
    const lfContent = 'line1\nline2\n';

    const exactCRLF = computeExactHash(crlfContent);
    const exactLF = computeExactHash(lfContent);

    const semanticCRLF = computeSemanticHash(crlfContent);
    const semanticLF = computeSemanticHash(lfContent);

    // Exact byte hashes differ due to \r\n vs \n
    assert.notStrictEqual(exactCRLF, exactLF);

    // Semantic hashes match identically
    assert.strictEqual(semanticCRLF, semanticLF);
    assert.ok(semanticCRLF.startsWith('sha256:'));
  });

  it('creates, writes, validates, and reads Lockfile v2 data', () => {
    const manager = new LockfileV2Manager(tmpRoot);
    assert.strictEqual(manager.read(), null);

    const fresh = manager.createEmpty({
      packageName: 'my-project',
      profileId: 'backend',
    });

    manager.recordManagedFile(fresh, '.cursor/rules/auth.mdc', {
      exactSha256: computeExactHash('content'),
      semanticTextSha256: computeSemanticHash('content'),
      kind: 'generated-adapter',
      generator: 'cursor@2',
      inputsHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    });

    const written = manager.write(fresh);
    assert.strictEqual(written.schemaVersion, 2);
    assert.strictEqual(written.revision, 1);

    const reRead = manager.read();
    assert.strictEqual(reRead.package.name, 'my-project');
    assert.ok(reRead.managedFiles['.cursor/rules/auth.mdc']);

    // Second write increments revision
    const updated = manager.write(reRead, 1);
    assert.strictEqual(updated.revision, 2);
  });

  it('rejects write on revision conflict (CAS failure)', () => {
    const manager = new LockfileV2Manager(tmpRoot);
    const fresh = manager.createEmpty();
    manager.write(fresh); // Revision 1

    assert.throws(
      () => manager.write(fresh, 99), // Expected 99 but actual is 1
      (err) => err instanceof LockfileV2Error && err.code === LOCKFILE_ERRORS.REVISION_CONFLICT
    );
  });
});
