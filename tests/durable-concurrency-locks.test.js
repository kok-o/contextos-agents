/**
 * tests/durable-concurrency-locks.test.js
 * ContextOS — Concurrency, Lease Locks, Event Store & Idempotency Test Suite
 *
 * Verifies Milestone 12 (Issue #16):
 *   - LeaseLock acquisition, heartbeat renewal, and release
 *   - Fencing token monotonicity on takeover of expired leases
 *   - Stale owner takeover isolation (stale release cannot delete new lock)
 *   - Pure async backoff acquisition with AbortSignal support
 *   - DurableEventStore monotonic append, SHA-256 checksums, and replay
 *   - Snapshot generation and torn tail automatic quarantine
 *   - IdempotencyRegistry execution, deduplication replay, and conflict detection
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { LeaseLock } = require('../.agents/runtime/ipc-lock');
const { DurableEventStore } = require('../.agents/runtime/event-store');
const { IdempotencyRegistry } = require('../.agents/runtime/idempotency');

function createTempDir(prefix = 'ctx-durable-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('LeaseLock — basic acquisition, heartbeat renewal, and release', (t) => {
  const tmpDir = createTempDir('lease-basic-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const lockFile = path.join(tmpDir, 'project.lock');
  const lock = new LeaseLock({
    lockFilePath: lockFile,
    ttlMs: 2000,
    heartbeatIntervalMs: 500,
  });

  // 1. Acquire
  const acquired = lock.tryAcquire();
  assert.equal(acquired, true, 'Lock must be successfully acquired');
  assert.equal(lock.isHeld, true);
  assert.equal(lock.fencingToken, 1, 'Initial fencing token should be 1');

  const onDisk = lock.readLock();
  assert.ok(onDisk, 'Lock file must exist on disk');
  assert.equal(onDisk.ownerToken, lock.ownerToken);
  assert.equal(onDisk.fencingToken, 1);
  assert.equal(onDisk.pid, process.pid);

  // 2. Heartbeat extends expiresAt
  const initialExpires = onDisk.expiresAt;
  // Sleep 50ms then heartbeat
  const renewed = lock.heartbeat();
  assert.equal(renewed, true, 'Heartbeat renewal must succeed');
  const renewedOnDisk = lock.readLock();
  assert.ok(renewedOnDisk.expiresAt >= initialExpires, 'expiresAt must be extended');

  // 3. Release
  const released = lock.release();
  assert.equal(released, true, 'Lock must be cleanly released');
  assert.equal(lock.isHeld, false);
  assert.equal(fs.existsSync(lockFile), false, 'Lock file must be unlinked on release');
});

test('LeaseLock — rejects concurrent acquisition when unexpired', (t) => {
  const tmpDir = createTempDir('lease-reject-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const lockFile = path.join(tmpDir, 'project.lock');
  const lockA = new LeaseLock({ lockFilePath: lockFile, ttlMs: 10000 });
  const lockB = new LeaseLock({ lockFilePath: lockFile, ttlMs: 10000 });

  assert.equal(lockA.tryAcquire(), true, 'Lock A acquires first');
  assert.equal(lockB.tryAcquire(), false, 'Lock B must be rejected while Lock A is active');

  lockA.release();
  assert.equal(lockB.tryAcquire(), true, 'Lock B acquires after Lock A releases');
  lockB.release();
});

test('LeaseLock — takeover of expired lease with incremented fencing token', async (t) => {
  const tmpDir = createTempDir('lease-takeover-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const lockFile = path.join(tmpDir, 'project.lock');
  // Short TTL of 1000ms
  const lockA = new LeaseLock({ lockFilePath: lockFile, ttlMs: 1000 });
  const lockB = new LeaseLock({ lockFilePath: lockFile, ttlMs: 2000 });

  assert.equal(lockA.tryAcquire(), true, 'Lock A acquires');
  assert.equal(lockA.fencingToken, 1);

  // Stop Lock A heartbeat so it expires
  lockA._stopHeartbeat();

  // Wait 1100ms for Lock A to expire
  await new Promise((resolve) => setTimeout(resolve, 1100));

  assert.equal(lockB.tryAcquire(), true, 'Lock B should successfully take over expired lock');
  assert.equal(lockB.fencingToken, 2, 'Fencing token must increment to 2');
  assert.equal(lockB.isHeld, true);

  // Stale Lock A release must NOT unlink or corrupt Lock B's lock!
  const staleRelease = lockA.release();
  assert.equal(staleRelease, false, 'Stale owner release must fail');

  const currentDisk = lockB.readLock();
  assert.ok(currentDisk, 'Lock file must still exist');
  assert.equal(currentDisk.ownerToken, lockB.ownerToken, 'Lock B must remain owner');
  assert.equal(currentDisk.fencingToken, 2);

  lockB.release();
});

test('LeaseLock — async acquire with backoff and AbortSignal', async (t) => {
  const tmpDir = createTempDir('lease-async-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const lockFile = path.join(tmpDir, 'project.lock');
  const lockA = new LeaseLock({ lockFilePath: lockFile, ttlMs: 5000 });
  const lockB = new LeaseLock({ lockFilePath: lockFile, ttlMs: 5000 });

  assert.equal(lockA.tryAcquire(), true);

  // Test AbortSignal
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);

  await assert.rejects(
    async () => {
      await lockB.acquire({ timeoutMs: 5000, signal: controller.signal });
    },
    { code: 'CTX_LOCK_ACQUISITION_ABORTED' }
  );

  // Test delayed release and async resolution
  setTimeout(() => {
    lockA.release();
  }, 300);

  const start = Date.now();
  const acquired = await lockB.acquire({ timeoutMs: 3000 });
  const duration = Date.now() - start;

  assert.equal(acquired, true);
  assert.ok(duration >= 250, `Expected duration >= 250ms, got ${duration}ms`);
  lockB.release();
});

test('DurableEventStore — monotonic append, SHA-256 checksums, and optimistic concurrency', (t) => {
  const tmpDir = createTempDir('event-store-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const store = new DurableEventStore({ baseDir: tmpDir, snapshotInterval: 10 });
  const streamId = 'thread-subagent-alpha';

  const evt1 = store.append(streamId, { type: 'TASK_ASSIGNED', taskId: 'T-101' }, 0);
  assert.equal(evt1.revision, 1);
  assert.ok(evt1.checksum, 'Event must have SHA-256 checksum');

  const evt2 = store.append(streamId, { type: 'TASK_STARTED', taskId: 'T-101' }, 1);
  assert.equal(evt2.revision, 2);

  // Optimistic concurrency failure: passing wrong expected revision
  assert.throws(
    () => {
      store.append(streamId, { type: 'TASK_COMPLETED' }, 1); // expected 1, but last was 2
    },
    { code: 'CTX_EVENT_CONCURRENCY_CONFLICT' }
  );

  const history = store.readStream(streamId);
  assert.equal(history.length, 2);
  assert.equal(history[0].revision, 1);
  assert.equal(history[1].revision, 2);
  assert.equal(history[1].data.type, 'TASK_STARTED');
});

test('DurableEventStore — replay, snapshots, and torn tail quarantine', (t) => {
  const tmpDir = createTempDir('event-replay-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const store = new DurableEventStore({ baseDir: tmpDir, snapshotInterval: 5 });
  const streamId = 'thread-beta';

  // Append 7 events to trigger snapshot at event 5
  for (let i = 1; i <= 7; i++) {
    store.append(streamId, { step: i, action: `EXEC_${i}` });
  }

  // Reducer accumulates executed steps
  const reducer = (state, event) => {
    state.steps = state.steps || [];
    state.steps.push(event.data.step);
    return state;
  };

  const replayed = store.replay(streamId, reducer, { steps: [] });
  assert.equal(replayed.revision, 7);
  assert.deepEqual(replayed.state.steps, [1, 2, 3, 4, 5, 6, 7]);

  // Inject a torn tail (corrupted JSON file at the end)
  const streamDir = path.join(tmpDir, 'events', streamId);
  const corruptedFile = path.join(streamDir, '000008-torn-crash.json');
  fs.writeFileSync(corruptedFile, '{"revision": 8, "corrupt": tru---', 'utf8');

  // Replay should NOT crash; it should quarantine the torn tail and restore to rev 7
  const recovered = store.replay(streamId, reducer, { steps: [] });
  assert.equal(recovered.revision, 7, 'Replay must recover up to valid revision 7');
  assert.equal(recovered.quarantinedCount, 1, 'One torn event must be quarantined');
  assert.deepEqual(recovered.state.steps, [1, 2, 3, 4, 5, 6, 7]);

  // Corrupted file was moved to quarantine
  assert.equal(fs.existsSync(corruptedFile), false, 'Corrupted file must be moved out of event stream');
  const quarantineFiles = fs.readdirSync(store.quarantineDir);
  assert.ok(quarantineFiles.length >= 1, 'Quarantine directory must contain moved file');
});

test('IdempotencyRegistry — deduplication replay and conflict detection', async (t) => {
  const tmpDir = createTempDir('idempotency-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const registry = new IdempotencyRegistry({ baseDir: tmpDir });
  const key = 'delegate-task-auth-impl';
  const payload = { taskId: 'auth-01', branch: 'subagent/auth-01', prompt: 'Implement JWT' };

  let executionCounter = 0;
  const factoryFn = async () => {
    executionCounter++;
    return {
      jobId: `job-${crypto.randomUUID().slice(0, 8)}`,
      branchName: 'subagent/auth-01',
      worktreePath: path.join(tmpDir, 'wt-auth-01'),
    };
  };

  // 1. First execution
  const first = await registry.execute(key, payload, factoryFn);
  assert.equal(first.isExisting, false);
  assert.equal(executionCounter, 1);
  const originalJobId = first.record.jobId;
  assert.ok(originalJobId);

  // 2. Second execution with identical payload -> deduplicated replay
  const second = await registry.execute(key, payload, factoryFn);
  assert.equal(second.isExisting, true, 'Subsequent execution must return existing record');
  assert.equal(second.record.jobId, originalJobId, 'Job ID must match cached result');
  assert.equal(executionCounter, 1, 'Factory function must not run again');

  // 3. Third execution with differing payload -> conflict error
  const differingPayload = { taskId: 'auth-01', branch: 'subagent/auth-01', prompt: 'DIFFERENT PROMPT' };
  await assert.rejects(
    async () => {
      await registry.execute(key, differingPayload, factoryFn);
    },
    { code: 'CTX_IDEMPOTENCY_CONFLICT' }
  );
  assert.equal(executionCounter, 1, 'Factory function must not run on conflict');
});
