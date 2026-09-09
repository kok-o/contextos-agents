/**
 * .agents/filesystem/project-lock.js
 * ContextOS Project-Wide Inter-Process Mutation Lock
 *
 * Enforces single-writer mutual exclusion during compilation, export, and migration.
 * - Atomic acquisition via exclusive filesystem creation (O_CREAT | O_EXCL / 'wx')
 * - Cryptographic UUID token prevents zombie/stale processes from releasing new locks
 * - Stale process detection via PID liveness probe (kill(pid, 0))
 * - Structured machine-readable diagnostic output (CTX_PROJECT_BUSY)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const LOCK_SUBPATH = path.join('.agents', '.contextos', 'locks', 'mutation.lock');
const ERROR_CODES = {
  BUSY: 'CTX_PROJECT_BUSY',
  INVALID_TOKEN: 'CTX_LOCK_INVALID_TOKEN',
  NOT_LOCKED: 'CTX_LOCK_NOT_LOCKED',
};

class ProjectLockError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ProjectLockError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Checks if a PID is alive on the local system.
 */
function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // Process exists but lacks permission to signal
  }
}

class ProjectMutationLock {
  constructor(projectRoot, options = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.lockPath = options.lockPath
      ? path.resolve(this.projectRoot, options.lockPath)
      : path.resolve(this.projectRoot, LOCK_SUBPATH);
    this.lockDir = path.dirname(this.lockPath);
    this.currentToken = null;
  }

  /**
   * Reads and parses current lock payload, or null if lock doesn't exist.
   */
  inspect() {
    try {
      if (!fs.existsSync(this.lockPath)) return null;
      const raw = fs.readFileSync(this.lockPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Checks if lock is currently held.
   */
  isLocked() {
    return this.inspect() !== null;
  }

  /**
   * Attempts to acquire the mutation lock exclusively.
   *
   * @param {object} [meta] - Context metadata
   * @param {string} [meta.command='mutation'] - Triggering command
   * @param {string} [meta.projectFingerprint=''] - Project identity fingerprint
   * @param {boolean} [meta.autoReapStale=true] - Automatically reclaim lock if holder PID is dead
   * @returns {string} The secret lock token required for release
   */
  acquire(meta = {}) {
    if (!fs.existsSync(this.lockDir)) {
      fs.mkdirSync(this.lockDir, { recursive: true });
    }

    const {
      command = 'mutation',
      projectFingerprint = '',
      autoReapStale = true,
    } = meta;

    // Check for existing lock and inspect holder
    const existing = this.inspect();
    if (existing) {
      if (autoReapStale && existing.pid && !isPidAlive(existing.pid)) {
        // Holder PID is dead, safe to reap stale lock
        this.forceUnlock(`Auto-reaped stale lock from dead PID ${existing.pid}`);
      } else {
        throw new ProjectLockError(
          ERROR_CODES.BUSY,
          `Project is busy: lock is held by PID ${existing.pid} (${existing.command || 'unknown'}) since ${existing.acquiredAt}`,
          { lockDetails: existing }
        );
      }
    }

    const token = crypto.randomUUID();
    const payload = {
      token,
      pid: process.pid,
      processStartedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
      hostname: os.hostname(),
      command,
      projectFingerprint,
      acquiredAt: new Date().toISOString(),
    };

    let fd = null;
    try {
      // 'wx' flag opens for writing, failing if path already exists (O_CREAT | O_EXCL)
      fd = fs.openSync(this.lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } catch (err) {
      if (err.code === 'EEXIST') {
        const currentHolder = this.inspect();
        throw new ProjectLockError(
          ERROR_CODES.BUSY,
          `Project is busy: lock acquired concurrently by another process`,
          { lockDetails: currentHolder }
        );
      }
      throw err;
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // Best effort close
        }
      }
    }

    this.currentToken = token;
    return token;
  }

  /**
   * Releases lock verifying ownership token.
   *
   * @param {string} [token] - Release token (defaults to currently held token)
   */
  release(token = this.currentToken) {
    if (!token) {
      throw new ProjectLockError(
        ERROR_CODES.INVALID_TOKEN,
        'Cannot release lock: no token provided and no token actively held in session'
      );
    }

    const current = this.inspect();
    if (!current) {
      this.currentToken = null;
      return; // Already unlocked
    }

    if (current.token !== token) {
      throw new ProjectLockError(
        ERROR_CODES.INVALID_TOKEN,
        `Token mismatch: current lock belongs to PID ${current.pid} acquired at ${current.acquiredAt}`,
        { expectedToken: current.token, attemptedToken: token }
      );
    }

    try {
      fs.unlinkSync(this.lockPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    this.currentToken = null;
  }

  /**
   * Administratively forces removal of the lock.
   */
  forceUnlock(reason = 'Administrative force unlock') {
    try {
      if (fs.existsSync(this.lockPath)) {
        fs.unlinkSync(this.lockPath);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.currentToken = null;
    return { success: true, reason };
  }
}

module.exports = {
  ProjectMutationLock,
  ProjectLockError,
  ERROR_CODES,
  isPidAlive,
};
