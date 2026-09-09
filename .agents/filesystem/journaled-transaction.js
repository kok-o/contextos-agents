/**
 * .agents/filesystem/journaled-transaction.js
 * ContextOS Journaled Recoverable File Transactions
 *
 * Implements crash-resilient multi-file mutation protocol:
 * - State machine: PLANNED -> PREPARED -> APPLYING -> COMMITTED
 * - Failure handling: APPLYING -> ROLLING_BACK -> ROLLED_BACK
 * - Crash recovery: incomplete journals trigger RECOVERY_REQUIRED
 * - Precondition checks (expectedBeforeHash) prevent clobbering concurrent user edits
 * - Transient Windows locking backoff retry (EACCES, EPERM, EBUSY)
 * - Zero direct-write fallback: atomicity or complete rollback
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveManagedPath, toPosix } = require('./safe-path.js');
const { computeExactHash } = require('./lockfile-v2.js');

const TX_BASE_SUBPATH = path.join('.agents', '.contextos', 'transactions');

const TX_STATES = {
  PLANNED: 'PLANNED',
  PREPARED: 'PREPARED',
  APPLYING: 'APPLYING',
  COMMITTED: 'COMMITTED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
};

const ERROR_CODES = {
  PRECONDITION_FAILED: 'CTX_TX_PRECONDITION_FAILED',
  APPLY_FAILED: 'CTX_TX_APPLY_FAILED',
  ROLLBACK_FAILED: 'CTX_TX_ROLLBACK_FAILED',
  RECOVERY_REQUIRED: 'CTX_TX_RECOVERY_REQUIRED',
  INVALID_STATE: 'CTX_TX_INVALID_STATE',
};

class TransactionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TransactionError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Windows-aware atomic rename with bounded retry for transient locks.
 */
function safeRenameSync(sourcePath, targetPath, maxRetries = 3, delays = [10, 50, 150]) {
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      fs.renameSync(sourcePath, targetPath);
      return;
    } catch (err) {
      lastError = err;
      const isTransient = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (isTransient && attempt < maxRetries) {
        const waitMs = delays[attempt] || 50;
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
        } catch {
          const start = Date.now();
          while (Date.now() - start < waitMs) {}
        }
      } else {
        break;
      }
    }
  }
  throw lastError;
}

class JournaledTransaction {
  constructor(projectRoot, txId = null) {
    this.projectRoot = path.resolve(projectRoot);
    this.txId = txId || `tx-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.txDir = path.resolve(this.projectRoot, TX_BASE_SUBPATH, this.txId);
    this.journalPath = path.join(this.txDir, 'journal.json');
    this.stagingDir = path.join(this.txDir, 'staging');
    this.backupDir = path.join(this.txDir, 'backup');

    this.state = TX_STATES.PLANNED;
    this.operations = [];
    this.appliedOperations = [];
    this.createdAt = new Date().toISOString();
  }

  /**
   * Plans a write or replace operation.
   */
  stageWrite(relativePath, content, options = {}) {
    if (this.state !== TX_STATES.PLANNED) {
      throw new TransactionError(
        ERROR_CODES.INVALID_STATE,
        `Cannot stage operations in state '${this.state}' (must be PLANNED)`
      );
    }

    const { resolvedPath, relativePosixPath } = resolveManagedPath(this.projectRoot, relativePath);
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const afterHash = computeExactHash(buf);

    this.operations.push({
      type: 'write',
      relativePath: relativePosixPath,
      resolvedPath,
      content: buf,
      afterHash,
      expectedBeforeHash: options.expectedBeforeHash || null,
      mode: options.mode || 420,
    });
  }

  /**
   * Plans a delete operation.
   */
  stageDelete(relativePath, options = {}) {
    if (this.state !== TX_STATES.PLANNED) {
      throw new TransactionError(
        ERROR_CODES.INVALID_STATE,
        `Cannot stage operations in state '${this.state}' (must be PLANNED)`
      );
    }

    const { resolvedPath, relativePosixPath } = resolveManagedPath(this.projectRoot, relativePath);

    this.operations.push({
      type: 'delete',
      relativePath: relativePosixPath,
      resolvedPath,
      expectedBeforeHash: options.expectedBeforeHash || null,
    });
  }

  /**
   * Writes the journal and staged files to disk.
   */
  prepare() {
    if (this.state !== TX_STATES.PLANNED) {
      throw new TransactionError(
        ERROR_CODES.INVALID_STATE,
        `Cannot prepare transaction from state '${this.state}'`
      );
    }

    fs.mkdirSync(this.stagingDir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    // Write staged files
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      if (op.type === 'write') {
        const stagedFilePath = path.join(this.stagingDir, `${i}-${path.basename(op.relativePath)}`);
        fs.writeFileSync(stagedFilePath, op.content);
        op.stagedFilePath = stagedFilePath;
      }
    }

    this.state = TX_STATES.PREPARED;
    this.saveJournal();
    return this;
  }

  /**
   * Executes the transaction, modifying disk files.
   */
  commit() {
    if (this.state === TX_STATES.PLANNED) {
      this.prepare();
    }

    if (this.state !== TX_STATES.PREPARED) {
      throw new TransactionError(
        ERROR_CODES.INVALID_STATE,
        `Cannot commit transaction in state '${this.state}'`
      );
    }

    this.state = TX_STATES.APPLYING;
    this.saveJournal();

    // 1. Verify all preconditions before touching any file
    for (const op of this.operations) {
      if (op.expectedBeforeHash) {
        if (fs.existsSync(op.resolvedPath)) {
          const currentBuf = fs.readFileSync(op.resolvedPath);
          const currentHash = computeExactHash(currentBuf);
          if (currentHash !== op.expectedBeforeHash) {
            this.rollback();
            throw new TransactionError(
              ERROR_CODES.PRECONDITION_FAILED,
              `Precondition hash mismatch for '${op.relativePath}': expected ${op.expectedBeforeHash}, found ${currentHash}`,
              { relativePath: op.relativePath, expected: op.expectedBeforeHash, actual: currentHash }
            );
          }
        } else if (op.expectedBeforeHash !== 'NONE') {
          this.rollback();
          throw new TransactionError(
            ERROR_CODES.PRECONDITION_FAILED,
            `Precondition failed: target file '${op.relativePath}' does not exist on disk`,
            { relativePath: op.relativePath }
          );
        }
      }
    }

    // 2. Apply operations sequentially with backups
    try {
      for (let i = 0; i < this.operations.length; i++) {
        const op = this.operations[i];
        const backupFilePath = path.join(this.backupDir, `${i}-${path.basename(op.relativePath)}`);

        if (fs.existsSync(op.resolvedPath)) {
          // Backup existing target
          fs.copyFileSync(op.resolvedPath, backupFilePath);
          op.backupFilePath = backupFilePath;
          op.hadExisting = true;
        } else {
          op.hadExisting = false;
        }

        if (op.type === 'write') {
          safeRenameSync(op.stagedFilePath, op.resolvedPath);
        } else if (op.type === 'delete') {
          if (fs.existsSync(op.resolvedPath)) {
            fs.unlinkSync(op.resolvedPath);
          }
        }

        this.appliedOperations.push(op);
      }
    } catch (applyErr) {
      // Automatic reverse-order rollback on failure
      this.rollback();
      throw new TransactionError(
        ERROR_CODES.APPLY_FAILED,
        `Transaction apply failed: ${applyErr.message}. All modifications rolled back successfully.`,
        { originalError: applyErr.message }
      );
    }

    this.state = TX_STATES.COMMITTED;
    this.completedAt = new Date().toISOString();
    this.saveJournal();

    // Clean up temporary transaction staging/backups upon clean commit
    this.cleanup();

    return {
      txId: this.txId,
      status: 'COMMITTED',
      appliedCount: this.appliedOperations.length,
    };
  }

  /**
   * Rolls back applied modifications in reverse order.
   */
  rollback() {
    this.state = TX_STATES.ROLLING_BACK;
    this.saveJournal();

    let rollbackError = null;
    const toRevert = [...this.appliedOperations].reverse();

    for (const op of toRevert) {
      try {
        if (op.hadExisting && op.backupFilePath && fs.existsSync(op.backupFilePath)) {
          safeRenameSync(op.backupFilePath, op.resolvedPath);
        } else if (!op.hadExisting && fs.existsSync(op.resolvedPath)) {
          // File was newly created by this tx, remove it
          fs.unlinkSync(op.resolvedPath);
        }
      } catch (err) {
        rollbackError = err;
      }
    }

    if (rollbackError) {
      this.state = TX_STATES.RECOVERY_REQUIRED;
      this.saveJournal();
      throw new TransactionError(
        ERROR_CODES.ROLLBACK_FAILED,
        `Rollback failed: ${rollbackError.message}. Manual recovery required for tx '${this.txId}'`,
        { txId: this.txId, originalError: rollbackError.message }
      );
    }

    this.state = TX_STATES.ROLLED_BACK;
    this.saveJournal();
    this.cleanup();

    return { txId: this.txId, status: 'ROLLED_BACK' };
  }

  saveJournal() {
    if (!fs.existsSync(this.txDir)) {
      fs.mkdirSync(this.txDir, { recursive: true });
    }

    const journalData = {
      txId: this.txId,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      completedAt: this.completedAt || null,
      operations: this.operations.map(o => ({
        type: o.type,
        relativePath: o.relativePath,
        afterHash: o.afterHash,
        expectedBeforeHash: o.expectedBeforeHash,
        hadExisting: o.hadExisting,
        stagedFilePath: o.stagedFilePath || null,
        backupFilePath: o.backupFilePath || null,
      })),
    };

    fs.writeFileSync(this.journalPath, JSON.stringify(journalData, null, 2), 'utf8');
  }

  cleanup() {
    try {
      if (fs.existsSync(this.stagingDir)) {
        fs.rmSync(this.stagingDir, { recursive: true, force: true });
      }
      if (fs.existsSync(this.backupDir)) {
        fs.rmSync(this.backupDir, { recursive: true, force: true });
      }
      if (fs.existsSync(this.txDir)) {
        fs.rmSync(this.txDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup of completed transactions
    }
  }

  /**
   * Inspects pending or broken transactions across the project.
   */
  static listPending(projectRoot) {
    const baseDir = path.resolve(projectRoot, TX_BASE_SUBPATH);
    if (!fs.existsSync(baseDir)) return [];

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const pending = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const jPath = path.join(baseDir, ent.name, 'journal.json');
        if (fs.existsSync(jPath)) {
          try {
            const data = JSON.parse(fs.readFileSync(jPath, 'utf8'));
            if (data.state === TX_STATES.APPLYING || data.state === TX_STATES.ROLLING_BACK || data.state === TX_STATES.RECOVERY_REQUIRED) {
              pending.push(data);
            }
          } catch {
            pending.push({ txId: ent.name, state: TX_STATES.RECOVERY_REQUIRED, error: 'Unparseable journal' });
          }
        }
      }
    }

    return pending;
  }
}

module.exports = {
  JournaledTransaction,
  TX_STATES,
  ERROR_CODES,
  TransactionError,
  safeRenameSync,
};
