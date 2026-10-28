/**
 * tests/project-lock.test.js
 * Test suite for ProjectMutationLock and inter-process locking
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { fork, spawnSync } = require('node:child_process');

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

  it('a paused stale contender cannot unlink a live replacement acquired by another process', async () => {
    const lock = new ProjectMutationLock(tmpRoot);
    fs.mkdirSync(lock.lockDir, { recursive: true });
    fs.writeFileSync(lock.lockPath, JSON.stringify({ token: 'dead-owner', pid: 99999999 }));
    const childFile = path.join(tmpRoot, 'contender.cjs');
    const gate = path.join(tmpRoot, 'proceed');
    fs.writeFileSync(childFile, `
      const fs = require('node:fs');
      const { ProjectMutationLock } = require(${JSON.stringify(require.resolve('../.agents/filesystem/project-lock.js'))});
      const lock = new ProjectMutationLock(${JSON.stringify(tmpRoot)});
      const inspect = lock.inspect.bind(lock);
      let first = true;
      lock.inspect = () => {
        const observed = inspect();
        if (first) {
          first = false;
          process.send({ phase: 'observed-stale' });
          const deadline = Date.now() + 10000;
          while (!fs.existsSync(${JSON.stringify(gate)})) {
            if (Date.now() > deadline) process.exit(74);
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          }
        }
        return observed;
      };
      try { process.send({ phase: 'result', acquired: true, token: lock.acquire() }); }
      catch (err) { process.send({ phase: 'result', acquired: false, code: err.code }); }
      process.disconnect();
    `);
    const child = fork(childFile, { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    let token;
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('stale contender timed out')), 15000);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('message', message => {
          if (message.phase === 'observed-stale') {
            try {
              token = lock.acquire({ command: 'replacement-writer' });
              fs.writeFileSync(gate, 'go');
            } catch (error) { clearTimeout(timer); reject(error); }
          } else { clearTimeout(timer); resolve(message); }
        });
        child.on('exit', code => { if (code) { clearTimeout(timer); reject(new Error(`child exit ${code}`)); } });
      });
      assert.equal(result.acquired, false);
      assert.equal(result.code, LOCK_ERRORS.BUSY);
      assert.equal(lock.inspect().token, token, 'the live replacement must remain owned');
      lock.release(token);
    } finally {
      child.kill();
    }
  });

  it('a real crashed holder can be reaped without leaving an active recovery claim', () => {
    const modulePath = require.resolve('../.agents/filesystem/project-lock.js');
    const crashed = spawnSync(process.execPath, ['-e', `
      const { ProjectMutationLock } = require(${JSON.stringify(modulePath)});
      new ProjectMutationLock(${JSON.stringify(tmpRoot)}).acquire({ command: 'crashed-writer' });
    `], { encoding: 'utf8' });
    assert.equal(crashed.status, 0, crashed.stderr);
    const lock = new ProjectMutationLock(tmpRoot);
    const token = lock.acquire({ command: 'replacement' });
    assert.deepEqual(fs.readdirSync(lock.lockDir), ['mutation.lock']);
    lock.release(token);
  });

  it('a crash while claiming recovery fails closed until explicit administrative recovery', () => {
    const lock = new ProjectMutationLock(tmpRoot);
    fs.mkdirSync(lock.lockDir, { recursive: true });
    fs.writeFileSync(lock.lockPath, JSON.stringify({ token: 'dead-before-claim', pid: 99999999 }));
    const crashed = spawnSync(process.execPath, ['-e', `
      const fs = require('node:fs');
      const { ProjectMutationLock } = require(${JSON.stringify(require.resolve('../.agents/filesystem/project-lock.js'))});
      const write = fs.writeFileSync;
      fs.writeFileSync = (file, ...args) => {
        const result = write(file, ...args);
        if (String(file).includes('.reap-')) process.exit(73);
        return result;
      };
      new ProjectMutationLock(${JSON.stringify(tmpRoot)}).acquire();
    `], { encoding: 'utf8' });
    assert.equal(crashed.status, 73, crashed.stderr);
    assert.throws(() => lock.acquire(), error => error.code === LOCK_ERRORS.BUSY && Boolean(error.details.recoveryClaim));
    assert.equal(lock.inspect().token, 'dead-before-claim');
    lock.forceUnlock('Explicit recovery of crashed lock claimant');
    const token = lock.acquire();
    assert.deepEqual(fs.readdirSync(lock.lockDir), ['mutation.lock']);
    lock.release(token);
  });

  it('does not auto-reap a foreign-host lock or a malformed owner identity', () => {
    const lock = new ProjectMutationLock(tmpRoot);
    fs.mkdirSync(lock.lockDir, { recursive: true });
    for (const payload of [{ token: 'foreign', pid: 99999999, hostname: `${os.hostname()}-different` },
      { token: 'invalid', pid: 'not-a-pid' }, { pid: 99999999 }]) {
      fs.writeFileSync(lock.lockPath, JSON.stringify(payload));
      assert.throws(() => lock.acquire(), error => error.code === LOCK_ERRORS.BUSY);
      assert.deepEqual(lock.inspect(), payload);
    }
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
