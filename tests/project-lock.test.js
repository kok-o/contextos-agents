/**
 * tests/project-lock.test.js
 * Test suite for ProjectMutationLock and inter-process locking
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  ProjectMutationLock,
  ProjectLockError,
  LOCK_ERRORS,
} = require('../.agents/filesystem/index.js');

describe('project-lock.js — Project-Wide Inter-Process Mutation Lock', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `ctx-lock-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('acquires lock exclusively and generates a valid token', () => {
    const lock = new ProjectMutationLock(tmpRoot);
    assert.strictEqual(lock.isLocked(), false);

    const token = lock.acquire({ command: 'test-compile' });
    assert.ok(token && typeof token === 'string');
    assert.strictEqual(lock.isLocked(), true);

    const info = lock.inspect();
    assert.strictEqual(info.token, token);
    assert.strictEqual(info.pid, process.pid);
    assert.strictEqual(info.command, 'test-compile');

    lock.release(token);
    assert.strictEqual(lock.isLocked(), false);
  });

  it('rejects concurrent acquisition attempts with CTX_PROJECT_BUSY', () => {
    const lock1 = new ProjectMutationLock(tmpRoot);
    const lock2 = new ProjectMutationLock(tmpRoot);

    const token1 = lock1.acquire({ command: 'primary-worker' });
    assert.ok(token1);

    assert.throws(
      () => lock2.acquire({ command: 'secondary-worker' }),
      (err) => {
        assert.ok(err instanceof ProjectLockError);
        assert.strictEqual(err.code, LOCK_ERRORS.BUSY);
        assert.strictEqual(err.details.lockDetails.pid, process.pid);
        return true;
      }
    );

    lock1.release(token1);
    assert.strictEqual(lock2.isLocked(), false);
  });

  it('rejects release with invalid or mismatched token', () => {
    const lock = new ProjectMutationLock(tmpRoot);
    const token = lock.acquire({ command: 'token-test' });

    assert.throws(
      () => lock.release('wrong-token-12345'),
      (err) => err instanceof ProjectLockError && err.code === LOCK_ERRORS.INVALID_TOKEN
    );

    // Lock remains held
    assert.strictEqual(lock.isLocked(), true);

    lock.release(token);
    assert.strictEqual(lock.isLocked(), false);
  });

  it('auto-reaps stale locks when holder PID no longer exists', () => {
    const lockPath = path.join(tmpRoot, '.agents', '.contextos', 'locks', 'mutation.lock');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });

    // Write a mock lock from a non-existent dead PID (e.g. 99999999)
    const deadPayload = {
      token: 'dead-token',
      pid: 99999999,
      command: 'zombie-job',
      acquiredAt: new Date(Date.now() - 60000).toISOString(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(deadPayload), 'utf8');

    const lock = new ProjectMutationLock(tmpRoot);
    assert.strictEqual(lock.isLocked(), true);

    // acquire should detect that PID 99999999 is not alive and auto-reap
    const newToken = lock.acquire({ command: 'new-job', autoReapStale: true });
    assert.ok(newToken);
    assert.notStrictEqual(newToken, 'dead-token');

    const inspected = lock.inspect();
    assert.strictEqual(inspected.pid, process.pid);

    lock.release(newToken);
  });

  it('supports forceUnlock administrative command', () => {
    const lock = new ProjectMutationLock(tmpRoot);
    lock.acquire({ command: 'admin-test' });
    assert.strictEqual(lock.isLocked(), true);

    const result = lock.forceUnlock('User manual override');
    assert.strictEqual(result.success, true);
    assert.strictEqual(lock.isLocked(), false);
  });
});
