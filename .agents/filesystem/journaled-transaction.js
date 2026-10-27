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
const { isNetworkOrUNCPath } = require('./platform-hardening.js');

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
  UNSUPPORTED: 'UNSUPPORTED',
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
function safeRenameSync(sourcePath, targetPath, maxRetries = 3, delays = [10, 50, 150], beforeAttempt = null) {
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // A sharing violation can outlast the caller's last hash check. Validate
    // immediately before every attempt, including attempts after backoff.
    if (beforeAttempt) beforeAttempt();
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(this.txId)) {
      throw new TransactionError(ERROR_CODES.INVALID_STATE, 'Invalid transaction ID');
    }
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
   * Plans an empty directory deletion operation.
   */
  stageDeleteDir(relativePath, options = {}) {
    if (this.state !== TX_STATES.PLANNED) {
      throw new TransactionError(
        ERROR_CODES.INVALID_STATE,
        `Cannot stage operations in state '${this.state}' (must be PLANNED)`
      );
    }

    const { resolvedPath, relativePosixPath } = resolveManagedPath(this.projectRoot, relativePath);

    this.operations.push({
      type: 'deleteDir',
      relativePath: relativePosixPath,
      resolvedPath,
    });
  }

  /**
   * Plans deletion of a file and of every parent directory that is empty once
   * it is gone. Directories are removed only when empty at commit time, and
   * never above the project root.
   */
  stageDeleteWithParents(relativePath, options = {}) {
    this.stageDelete(relativePath, options);
    let dir = path.posix.dirname(toPosix(relativePath));
    while (dir && dir !== '.' && dir !== '') {
      this.stageDeleteDir(dir);
      dir = path.posix.dirname(dir);
    }
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

    resolveManagedPath(this.projectRoot, path.relative(this.projectRoot, this.txDir));
    fs.mkdirSync(this.stagingDir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    // Write staged files
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      if (op.type !== 'deleteDir' && !op.expectedBeforeHash) op.expectedBeforeHash = this.currentHash(op);
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

    if (this.state !== TX_STATES.PREPARED && this.state !== TX_STATES.APPLYING) {
      throw new TransactionError(
        ERROR_CODES.INVALID_STATE,
        `Cannot commit transaction in state '${this.state}'`
      );
    }

    // Check the entire remaining plan before resuming any mutations. A file
    // changed after a crash must not be overwritten or lose its backup.
    for (const op of this.operations) {
      if (op.progress) {
        this.assertRecoverable(op);
      } else if (op.expectedBeforeHash && this.currentHash(op) !== op.expectedBeforeHash) {
        if (this.state === TX_STATES.PREPARED) this.rollback();
        throw new TransactionError(
          ERROR_CODES.PRECONDITION_FAILED,
          `Precondition hash mismatch for '${op.relativePath}'`,
          { relativePath: op.relativePath, expected: op.expectedBeforeHash }
        );
      }
      if (op.type === 'write' && !this.isApplied(op)) {
        if (!op.stagedFilePath || !fs.existsSync(op.stagedFilePath) || computeExactHash(fs.readFileSync(op.stagedFilePath)) !== op.afterHash) {
          throw new TransactionError(ERROR_CODES.APPLY_FAILED, `Missing or modified staged file for '${op.relativePath}'`);
        }
      }
      if (op.type !== 'deleteDir' && !op.progress && !op.expectedBeforeHash) {
        throw new TransactionError(
          ERROR_CODES.PRECONDITION_FAILED,
          `Missing original precondition for '${op.relativePath}'; manual recovery required, backups preserved`
        );
      }
    }

    this.state = TX_STATES.APPLYING;
    this.saveJournal();

    try {
      for (let i = 0; i < this.operations.length; i++) {
        const op = this.operations[i];
        if (op.progress && this.isApplied(op)) {
          op.progress = 'applied';
          continue;
        }

        resolveManagedPath(this.projectRoot, op.relativePath);
        if (!op.progress) {
          op.beforeHash = this.currentHash(op);
          if (op.expectedBeforeHash && op.beforeHash !== op.expectedBeforeHash) {
            throw new TransactionError(ERROR_CODES.PRECONDITION_FAILED, `Precondition hash mismatch for '${op.relativePath}'`);
          }
          op.hadExisting = op.beforeHash !== 'NONE';
          if (op.hadExisting && op.type !== 'deleteDir') {
            const backupFilePath = path.join(this.backupDir, `${i}-${path.basename(op.relativePath)}`);
            fs.copyFileSync(op.resolvedPath, backupFilePath);
            op.backupFilePath = backupFilePath;
          }
          // Persist the backup and intent BEFORE the mutation. If the process
          // dies before its next journal write, disk hashes disambiguate it.
          op.progress = 'applying';
          this.appliedOperations.push(op);
          this.saveJournal();
        }

        // Writing the journal may take time. Recheck after it as well, before
        // replacing or deleting a target that an editor could have changed.
        if (op.type !== 'deleteDir' && this.currentHash(op) !== op.beforeHash) {
          throw new TransactionError(ERROR_CODES.PRECONDITION_FAILED, `Precondition hash mismatch for '${op.relativePath}'`);
        }
        if (op.type === 'write') {
          safeRenameSync(op.stagedFilePath, op.resolvedPath, 3, [10, 50, 150], () => {
            if (this.currentHash(op) !== op.beforeHash) {
              throw new TransactionError(ERROR_CODES.PRECONDITION_FAILED, `Precondition hash mismatch for '${op.relativePath}'`);
            }
          });
        } else if (op.type === 'delete') {
          if (fs.existsSync(op.resolvedPath)) {
            fs.unlinkSync(op.resolvedPath);
          }
        } else if (op.type === 'deleteDir') {
          if (fs.existsSync(op.resolvedPath)) {
            try {
              fs.rmdirSync(op.resolvedPath);
            } catch (err) {
              // Gracefully ignore ENOTEMPTY or ENOENT as per W3.3 safety requirements
              if (err.code !== 'ENOTEMPTY' && err.code !== 'ENOENT' && err.code !== 'EEXIST') {
                throw err;
              }
            }
          }
        }

        op.progress = 'applied';
        this.saveJournal();
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
    if (this.state === TX_STATES.COMMITTED) {
      throw new TransactionError(ERROR_CODES.INVALID_STATE, 'Cannot roll back a committed transaction');
    }
    if (this.state === TX_STATES.ROLLED_BACK) return { txId: this.txId, status: 'ROLLED_BACK' };
    this.state = TX_STATES.ROLLING_BACK;
    this.saveJournal();

    let rollbackError = null;
    const toRevert = [...this.appliedOperations].reverse();

    for (const op of toRevert) {
      try {
        resolveManagedPath(this.projectRoot, op.relativePath);
        if (op.progress === 'rolledBack') continue;
        const beforeRestore = this.assertRecoverable(op);
        if (beforeRestore === op.beforeHash) {
          // Includes a rollback that reached disk just before another crash.
        } else if (op.hadExisting && op.type === 'deleteDir') {
          if (!fs.existsSync(op.resolvedPath)) {
            fs.mkdirSync(op.resolvedPath, { recursive: true });
          }
        } else if (op.hadExisting) {
          if (!op.backupFilePath || !fs.existsSync(op.backupFilePath) || computeExactHash(fs.readFileSync(op.backupFilePath)) !== op.beforeHash) {
            throw new Error(`Missing or modified backup for '${op.relativePath}'`);
          }
          // Keep the original backup until the entire rollback has succeeded.
          const restorePath = path.join(this.stagingDir, 'restore.tmp');
          fs.copyFileSync(op.backupFilePath, restorePath);
          safeRenameSync(restorePath, op.resolvedPath, 3, [10, 50, 150], () => {
            if (this.currentHash(op) !== beforeRestore) {
              throw new Error(`Refusing recovery: '${op.relativePath}' changed while preparing its restore; backups preserved`);
            }
          });
        } else if (!op.hadExisting && fs.existsSync(op.resolvedPath)) {
          // File or dir was newly created by this tx, remove it
          if (op.type === 'write' || op.type === 'delete') {
            fs.unlinkSync(op.resolvedPath);
          } else if (op.type === 'deleteDir') {
             // If we didn't have existing deleteDir, but we somehow created it? That's not a thing, but just in case
             fs.rmdirSync(op.resolvedPath);
          }
        }
        op.progress = 'rolledBack';
        this.saveJournal();
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

  currentHash(op) {
    resolveManagedPath(this.projectRoot, op.relativePath);
    if (!fs.existsSync(op.resolvedPath)) return 'NONE';
    if (fs.statSync(op.resolvedPath).isDirectory()) return 'DIRECTORY';
    return computeExactHash(fs.readFileSync(op.resolvedPath));
  }

  isApplied(op) {
    if (op.type === 'deleteDir') return !fs.existsSync(op.resolvedPath);
    return this.currentHash(op) === (op.type === 'write' ? op.afterHash : 'NONE');
  }

  assertRecoverable(op) {
    const current = this.currentHash(op);
    if (op.type === 'deleteDir' || current === op.beforeHash || current === (op.type === 'write' ? op.afterHash : 'NONE')) return current;
    throw new TransactionError(
      ERROR_CODES.PRECONDITION_FAILED,
      `Refusing recovery: '${op.relativePath}' changed after the transaction; backups preserved`,
      { relativePath: op.relativePath }
    );
  }

  saveJournal() {
    if (!fs.existsSync(this.txDir)) {
      fs.mkdirSync(this.txDir, { recursive: true });
    }

    const journalData = {
      schemaVersion: 2,
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
        beforeHash: o.beforeHash,
        progress: o.progress,
        mode: o.mode,
        hadExisting: o.hadExisting,
        stagedFilePath: o.stagedFilePath || null,
        backupFilePath: o.backupFilePath || null,
      })),
    };

    const tmpPath = `${this.journalPath}.tmp`;
    resolveManagedPath(this.projectRoot, path.relative(this.projectRoot, tmpPath));
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(journalData, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    safeRenameSync(tmpPath, this.journalPath);
  }

  cleanup() {
    try {
      if (fs.existsSync(this.stagingDir)) {
        fs.rmSync(this.stagingDir, { recursive: true, force: true });
      }
      if (fs.existsSync(this.backupDir)) {
        fs.rmSync(this.backupDir, { recursive: true, force: true });
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
            const st = data.state || data.status;
            if (st === TX_STATES.APPLYING || st === TX_STATES.ROLLING_BACK || st === TX_STATES.RECOVERY_REQUIRED || st === TX_STATES.PREPARED) {
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

  /**
   * Loads a transaction from an existing journal.json.
   */
  static load(projectRoot, txId) {
    const tx = new JournaledTransaction(projectRoot, txId);
    resolveManagedPath(tx.projectRoot, path.relative(tx.projectRoot, tx.journalPath));
    if (!fs.existsSync(tx.journalPath)) {
      throw new Error(`Transaction ${txId} not found`);
    }

    const data = JSON.parse(fs.readFileSync(tx.journalPath, 'utf8'));
    if (!Object.values(TX_STATES).includes(data.state) || (data.schemaVersion !== undefined && data.schemaVersion !== 2)) {
      throw new Error('Invalid transaction journal; backups preserved');
    }
    tx.state = data.state;
    tx.createdAt = data.createdAt;
    tx.completedAt = data.completedAt;

    tx.operations = data.operations.map((o, i) => {
      const op = { ...o, resolvedPath: resolveManagedPath(projectRoot, o.relativePath).resolvedPath };
      if (!['write', 'delete', 'deleteDir'].includes(op.type)) throw new Error('Invalid transaction operation');
      if (op.progress && (!['applying', 'applied', 'rolledBack'].includes(op.progress) || typeof op.beforeHash !== 'string' || typeof op.hadExisting !== 'boolean')) {
        throw new Error('Invalid transaction progress; backups preserved');
      }
      const backup = path.join(tx.backupDir, `${i}-${path.basename(op.relativePath)}`);
      const staged = path.join(tx.stagingDir, `${i}-${path.basename(op.relativePath)}`);
      for (const file of [backup, staged]) resolveManagedPath(tx.projectRoot, path.relative(tx.projectRoot, file));
      op.backupFilePath = fs.existsSync(backup) ? backup : null;
      op.stagedFilePath = op.type === 'write' ? staged : null;
      // Older journals did not record progress. Recover their deterministic
      // backups and consumed staging files instead of discarding the evidence.
      if (!op.progress && !data.schemaVersion) {
        if (op.backupFilePath) {
          op.beforeHash = computeExactHash(fs.readFileSync(backup));
          op.hadExisting = true;
          op.progress = 'applying';
        } else if (op.type === 'write' && !fs.existsSync(staged) && tx.isApplied(op)) {
          if (op.expectedBeforeHash !== 'NONE' && op.hadExisting !== false) {
            throw new Error(`Missing original backup for '${op.relativePath}'; manual recovery required`);
          }
          op.beforeHash = 'NONE';
          op.hadExisting = false;
          op.progress = 'applied';
        }
      }
      return op;
    });
    tx.appliedOperations = tx.operations.filter(op => op.progress === 'applying' || op.progress === 'applied');

    return tx;
  }
}

module.exports = {
  JournaledTransaction,
  TX_STATES,
  ERROR_CODES,
  TransactionError,
  safeRenameSync,
};
