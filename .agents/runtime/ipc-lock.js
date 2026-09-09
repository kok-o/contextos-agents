/**
 * .agents/runtime/ipc-lock.js
 * ContextOS — Durable IPC Lease Lock Engine with Fencing Tokens
 *
 * Implements Section 17.1 & 17.4 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Atomic acquisition with monotonic fencing tokens
 *   - Hostname, PID, processStartedAt, instanceId, and ownerToken tracking
 *   - Heartbeat lease extension with configurable TTL
 *   - Stale owner release prevention (stale owner cannot release new lock)
 *   - Pure async wait with bounded exponential backoff, jitter, and AbortSignal
 *   - Zero install-time dependencies (pure Node.js crypto & fs)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class LeaseLock {
  /**
   * @param {Object} options
   * @param {string} options.lockFilePath - Absolute path to lock file
   * @param {number} [options.ttlMs=15000] - Lease duration before expiration
   * @param {number} [options.heartbeatIntervalMs=5000] - Interval between lease renewal heartbeats
   * @param {string} [options.instanceId] - Machine/process instance UUID
   * @param {string} [options.repositoryFingerprint]
   */
  constructor(options = {}) {
    if (!options.lockFilePath) {
      throw new Error('LeaseLock requires lockFilePath');
    }

    this.lockFilePath = path.resolve(options.lockFilePath);
    this.lockDir = path.dirname(this.lockFilePath);
    this.ttlMs = Math.max(1000, options.ttlMs || 15000);
    this.heartbeatIntervalMs = Math.max(500, options.heartbeatIntervalMs || 5000);
    this.instanceId = options.instanceId || crypto.randomUUID();
    this.repositoryFingerprint = options.repositoryFingerprint || 'none';

    this.ownerToken = null;
    this.fencingToken = null;
    this.heartbeatTimer = null;
    this.processStartedAt = Date.now();
    this.isHeld = false;
  }

  /**
   * Reads current lock info from disk if present.
   *
   * @returns {Object|null}
   */
  readLock() {
    if (!fs.existsSync(this.lockFilePath)) return null;

    try {
      const content = fs.readFileSync(this.lockFilePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Attempts a single atomic acquisition of the lease.
   *
   * @returns {boolean} True if acquired
   */
  tryAcquire() {
    fs.mkdirSync(this.lockDir, { recursive: true });
    const now = Date.now();
    const current = this.readLock();

    let nextFencingToken = 1;

    if (current) {
      const isExpired = current.expiresAt && now > current.expiresAt;
      if (!isExpired) {
        return false; // Valid unexpired lock held by another owner
      }
      // Lock is expired: takeover with incremented fencing token
      nextFencingToken = (current.fencingToken || 0) + 1;
    }

    const newOwnerToken = crypto.randomUUID();
    const payload = {
      ownerToken: newOwnerToken,
      fencingToken: nextFencingToken,
      instanceId: this.instanceId,
      hostname: os.hostname(),
      pid: process.pid,
      processStartedAt: this.processStartedAt,
      heartbeatAt: now,
      expiresAt: now + this.ttlMs,
      repositoryFingerprint: this.repositoryFingerprint,
    };

    // Atomic write via unique temp file and rename/link
    const tempFile = `${this.lockFilePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), { flag: 'wx', encoding: 'utf8' });

      // Atomically link or rename
      try {
        if (process.platform === 'win32') {
          // On Windows, if destination exists, renameSync fails unless unlinked first.
          // Check again that current lock is still expired before replacing.
          const fresh = this.readLock();
          if (fresh && fresh.expiresAt && now <= fresh.expiresAt) {
            fs.unlinkSync(tempFile);
            return false;
          }
          if (fs.existsSync(this.lockFilePath)) {
            try { fs.unlinkSync(this.lockFilePath); } catch {}
          }
          fs.renameSync(tempFile, this.lockFilePath);
        } else {
          // On Unix, rename is atomic POSIX replace
          fs.renameSync(tempFile, this.lockFilePath);
        }
      } catch (renameErr) {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        return false;
      }

      // Verify that our token won the race
      const verified = this.readLock();
      if (!verified || verified.ownerToken !== newOwnerToken) {
        return false;
      }

      this.ownerToken = newOwnerToken;
      this.fencingToken = nextFencingToken;
      this.isHeld = true;
      this._startHeartbeat();
      return true;
    } catch {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      return false;
    }
  }

  /**
   * Pure async wait with exponential backoff and jitter (Section 17.4).
   * No Atomics.wait on event loop.
   *
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=30000]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<boolean>}
   */
  async acquire(options = {}) {
    const timeoutMs = options.timeoutMs || 30000;
    const signal = options.signal;
    const startTime = Date.now();

    let attempt = 0;
    const baseDelayMs = 50;
    const maxDelayMs = 1000;

    while (true) {
      if (signal && signal.aborted) {
        const err = new Error('Lock acquisition aborted');
        err.code = 'CTX_LOCK_ACQUISITION_ABORTED';
        throw err;
      }

      if (this.tryAcquire()) {
        return true;
      }

      if (Date.now() - startTime >= timeoutMs) {
        const err = new Error(`Timed out waiting to acquire lock: "${this.lockFilePath}" (${timeoutMs}ms)`);
        err.code = 'CTX_LOCK_TIMEOUT';
        throw err;
      }

      // Exponential backoff with jitter
      attempt++;
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(1.5, attempt));
      const jitter = Math.random() * 0.3 * expDelay;
      const sleepMs = Math.floor(expDelay + jitter);

      await new Promise(resolve => setTimeout(resolve, sleepMs));
    }
  }

  /**
   * Starts periodic heartbeat extending lease expiration.
   */
  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat();
    }, this.heartbeatIntervalMs);
    // Do not prevent process exit if only heartbeat timer is alive
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Extends lease expiration on disk if we are still the valid owner.
   *
   * @returns {boolean} True if successfully renewed
   */
  heartbeat() {
    if (!this.isHeld || !this.ownerToken) return false;

    const current = this.readLock();
    // Safety invariant: only renew if our ownerToken is on disk
    if (!current || current.ownerToken !== this.ownerToken) {
      // We lost the lock or lease expired and was taken over
      this.isHeld = false;
      this._stopHeartbeat();
      return false;
    }

    const now = Date.now();
    current.heartbeatAt = now;
    current.expiresAt = now + this.ttlMs;

    try {
      fs.writeFileSync(this.lockFilePath, JSON.stringify(current, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Releases lock strictly if ownerToken matches on disk.
   * Stale owner can NEVER delete a new lock acquired by another process.
   *
   * @returns {boolean} True if released
   */
  release() {
    this._stopHeartbeat();

    if (!this.ownerToken) {
      this.isHeld = false;
      return false;
    }

    const current = this.readLock();
    // Invariant: stale owner cannot delete a new lock
    if (!current || current.ownerToken !== this.ownerToken) {
      this.isHeld = false;
      this.ownerToken = null;
      return false; // Another owner already holds the lock
    }

    try {
      if (fs.existsSync(this.lockFilePath)) {
        fs.unlinkSync(this.lockFilePath);
      }
      this.isHeld = false;
      this.ownerToken = null;
      return true;
    } catch {
      this.isHeld = false;
      return false;
    }
  }

  /**
   * Asserts that current process holds a valid unexpired lease with expected fencing token.
   *
   * @param {number} [expectedFencingToken]
   */
  assertValid(expectedFencingToken) {
    if (!this.isHeld || !this.ownerToken) {
      const err = new Error('Lock is not held by current process');
      err.code = 'CTX_LOCK_NOT_HELD';
      throw err;
    }

    const current = this.readLock();
    if (!current || current.ownerToken !== this.ownerToken) {
      this.isHeld = false;
      const err = new Error('Lock lease was lost or taken over by another process');
      err.code = 'CTX_LOCK_LOST';
      throw err;
    }

    if (Date.now() > current.expiresAt) {
      this.isHeld = false;
      const err = new Error('Lock lease has expired');
      err.code = 'CTX_LOCK_EXPIRED';
      throw err;
    }

    if (typeof expectedFencingToken === 'number' && current.fencingToken !== expectedFencingToken) {
      const err = new Error(`Fencing token mismatch: expected ${expectedFencingToken}, got ${current.fencingToken}`);
      err.code = 'CTX_FENCING_TOKEN_MISMATCH';
      throw err;
    }
  }
}

module.exports = {
  LeaseLock,
};
