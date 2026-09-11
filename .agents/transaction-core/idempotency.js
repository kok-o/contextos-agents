/**
 * .agents/runtime/idempotency.js
 * ContextOS — Runtime Idempotency Engine
 *
 * Implements Section 17.5 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Idempotency key registration and deduplication
 *   - Safe replay: returns existing job/worktree without spawning duplicate branches
 *   - Conflict detection: raises error if payload differs for the same idempotency key
 *   - Atomic persistence to disk
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str || '').digest('hex');
}

class IdempotencyRegistry {
  /**
   * @param {Object} options
   * @param {string} options.baseDir - Base directory (.agents/.contextos)
   */
  constructor(options = {}) {
    this.rootDir = path.resolve(options.baseDir || process.cwd());
    this.registryDir = path.join(this.rootDir, '.agents', '.contextos', 'idempotency');
    fs.mkdirSync(this.registryDir, { recursive: true });
  }

  _getKeyPath(idempotencyKey) {
    const safeKey = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    return path.join(this.registryDir, `${safeKey}.json`);
  }

  /**
   * Hashes request payload deterministically.
   */
  hashPayload(payload) {
    if (typeof payload === 'string') return sha256(payload);
    return sha256(JSON.stringify(payload || {}));
  }

  /**
   * Checks if an idempotency key already exists.
   *
   * @param {string} idempotencyKey
   * @returns {Object|null}
   */
  get(idempotencyKey) {
    if (!idempotencyKey) return null;
    const keyPath = this._getKeyPath(idempotencyKey);
    if (!fs.existsSync(keyPath)) return null;

    try {
      const content = fs.readFileSync(keyPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Executes an operation with idempotency protection.
   * If key was previously executed with identical payload, returns cached result.
   * If payload differs, throws CTX_IDEMPOTENCY_CONFLICT.
   *
   * @param {string} idempotencyKey
   * @param {Object|string} payload
   * @param {Function} factoryFn - Async function returning { jobId, threadId, branchName, worktreePath }
   * @returns {Promise<{ isExisting: boolean, record: Object }>}
   */
  async execute(idempotencyKey, payload, factoryFn) {
    if (!idempotencyKey) {
      // No idempotency key -> execute directly without caching
      const result = await factoryFn();
      return { isExisting: false, record: result };
    }

    const payloadHash = this.hashPayload(payload);
    const existing = this.get(idempotencyKey);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        const err = new Error(
          `Idempotency conflict for key "${idempotencyKey}": payload does not match previously submitted request.`
        );
        err.code = 'CTX_IDEMPOTENCY_CONFLICT';
        err.idempotencyKey = idempotencyKey;
        err.existingJobId = existing.jobId;
        throw err;
      }

      // Existing request matched identically -> return existing job without creating duplicate
      return { isExisting: true, record: existing };
    }

    // Execute operation
    const result = await factoryFn();

    const record = {
      idempotencyKey,
      payloadHash,
      jobId: result.jobId || result.id || `job-${Date.now()}`,
      threadId: result.threadId || result.id || null,
      branchName: result.branchName || null,
      worktreePath: result.worktreePath || null,
      createdAt: Date.now(),
      metadata: result,
    };

    const keyPath = this._getKeyPath(idempotencyKey);
    const tempPath = `${keyPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), 'utf8');
      fs.renameSync(tempPath, keyPath);
    } catch {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    }

    return { isExisting: false, record };
  }
}

module.exports = {
  IdempotencyRegistry,
};
