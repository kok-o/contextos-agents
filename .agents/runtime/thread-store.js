/**
 * .agents/runtime/thread-store.js
 * ContextOS — Persistent Transactional Thread Store
 *
 * Persists runtime threads to disk with atomic write guarantees,
 * optimistic concurrency checks, and append-only audit event trails.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  createThreadState,
  transitionThread,
} = require('./state-machine.js');

class ThreadStore {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseDir] - Project root directory
   */
  constructor(options = {}) {
    this.rootDir = path.resolve(options.baseDir || process.cwd());
    this.storeDir = path.join(this.rootDir, '.agents', '.contextos', 'threads');
    fs.mkdirSync(this.storeDir, { recursive: true });
  }

  _getThreadPath(threadId) {
    const safeId = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storeDir, `${safeId}.json`);
  }

  _getAuditPath(threadId) {
    const safeId = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storeDir, `${safeId}.audit.jsonl`);
  }

  _getLockPath(threadId) {
    const safeId = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storeDir, `${safeId}.lock`);
  }

  /**
   * Acquires a lease for a given thread ID.
   * @param {string} threadId 
   * @param {string} [instanceId]
   * @returns {import('./ipc-lock').LeaseLock}
   */
  acquireLease(threadId, instanceId) {
    const { LeaseLock } = require('./ipc-lock.js');
    return new LeaseLock({
      lockFilePath: this._getLockPath(threadId),
      instanceId,
      ttlMs: 30000
    });
  }

  /**
   * Saves a thread to disk atomically.
   * @param {Object} thread
   * @param {import('./ipc-lock').LeaseLock} [lease] - Optional lease lock to enforce ownership.
   */
  save(thread, lease = null) {
    if (!thread || !thread.id) {
      throw new Error('Cannot save invalid thread object');
    }

    if (lease) {
      lease.assertValid();
    }

    const threadPath = this._getThreadPath(thread.id);
    const tempPath = `${threadPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(thread, null, 2), 'utf8');
      fs.renameSync(tempPath, threadPath);
    } catch (err) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
      throw err;
    }
  }

  /**
   * Loads a thread from disk.
   *
   * @param {string} threadId
   * @returns {Object|null}
   */
  get(threadId) {
    const threadPath = this._getThreadPath(threadId);
    if (!fs.existsSync(threadPath)) return null;

    try {
      const content = fs.readFileSync(threadPath, 'utf8');
      return Object.freeze(JSON.parse(content));
    } catch {
      return null;
    }
  }

  /**
   * Creates, saves, and returns a new thread.
   */
  create(options = {}) {
    const thread = createThreadState(options);
    this.save(thread);
    return thread;
  }

  /**
   * Atomically transitions a thread with optimistic revision verification and audit logging.
   *
   * @param {string} threadId
   * @param {Object} event - { type, payload, expectedRevision }
   * @returns {Object} Updated ThreadState
   */
  transition(threadId, event = {}) {
    const current = this.get(threadId);
    if (!current) {
      const err = new Error(`Thread not found: "${threadId}"`);
      err.code = 'CTX_THREAD_NOT_FOUND';
      throw err;
    }

    const auditPath = this._getAuditPath(threadId);
    const next = transitionThread(current, event, { auditFilePath: auditPath });
    this.save(next);
    return next;
  }

  /**
   * Returns audit trail events for a thread.
   *
   * @param {string} threadId
   * @returns {Array<Object>}
   */
  getAuditTrail(threadId) {
    const auditPath = this._getAuditPath(threadId);
    if (!fs.existsSync(auditPath)) return [];

    try {
      const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
      return lines.map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Lists all persisted threads.
   */
  list() {
    if (!fs.existsSync(this.storeDir)) return [];

    const files = fs.readdirSync(this.storeDir).filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
    const threads = [];

    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(this.storeDir, f), 'utf8');
        threads.push(JSON.parse(content));
      } catch {
        // ignore corrupted files
      }
    }

    return threads.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

module.exports = {
  ThreadStore,
};
