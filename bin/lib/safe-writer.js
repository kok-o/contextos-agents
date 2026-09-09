/**
 * bin/lib/safe-writer.js
 * Safe Atomic File Writer & Conflict Management for ContextOS
 *
 * Implements non-destructive file writes and uninstalls:
 * - Classified actions: CREATE, UPDATE, CONFLICT, SKIP, DELETE
 * - Unmanaged user-created files are NEVER touched or deleted
 * - User-modified managed files trigger sidecar (.contextos.new) without overwriting user work
 * - Atomic write via temporary file + rename with rollback on failure
 */

const fs = require('fs');
const path = require('path');
const {
  normalizePath,
  computeHash,
  computeFileHash,
  classifyFile,
  recordManagedFile,
  isManagedFile,
} = require('./lockfile.js');

/**
 * Atomically write content to a file with directory creation and rollback.
 */
function atomicWriteFile(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');

    let renamed = false;
    let lastError = null;
    const maxRetries = 3;
    const delays = [10, 50, 100];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        fs.renameSync(tmpPath, targetPath);
        renamed = true;
        break;
      } catch (renameErr) {
        lastError = renameErr;
        // Check for transient locking errors common on Windows (EPERM, EBUSY, EACCES)
        const isTransient = renameErr.code === 'EPERM' || renameErr.code === 'EBUSY' || renameErr.code === 'EACCES';
        if (isTransient && attempt < maxRetries) {
          const waitMs = delays[attempt];
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

    if (!renamed) {
      throw lastError || new Error(`Failed to atomically rename ${tmpPath} to ${targetPath}`);
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

/**
 * Clean up empty parent directories up to the .agents boundary.
 */
function cleanEmptyParentDirectories(filePath) {
  let currentDir = path.dirname(filePath);
  while (
    currentDir &&
    currentDir.includes('.agents') &&
    !currentDir.endsWith('.agents') &&
    !currentDir.endsWith('.agents/') &&
    !currentDir.endsWith('.agents\\')
  ) {
    try {
      const entries = fs.readdirSync(currentDir);
      if (entries.length === 0) {
        fs.rmdirSync(currentDir);
        currentDir = path.dirname(currentDir);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

/**
 * Plan a file write operation against the current filesystem and lockfile state.
 *
 * Returns an ActionPlan:
 * - 'CREATE': File does not exist on disk yet
 * - 'SKIP': File exists and is either already identical ('UP_TO_DATE') or user-created ('UNMANAGED_USER_FILE')
 * - 'UPDATE': Clean managed file with updated content
 * - 'CONFLICT': Managed file that the user has customized; writes to .contextos.new
 */
function planFileWrite({ projectDir, relPath, content, lockData, options = {} }) {
  const normRel = normalizePath(relPath);
  const fullPath = path.join(projectDir, normRel);
  const newHash = computeHash(content);

  if (!fs.existsSync(fullPath)) {
    return {
      action: 'CREATE',
      relPath: normRel,
      targetPath: fullPath,
      newContent: content,
      newHash,
      reason: 'NEW_FILE',
    };
  }

  const classification = classifyFile(projectDir, normRel, lockData);

  if (classification === 'UNMANAGED') {
    return {
      action: 'SKIP',
      relPath: normRel,
      targetPath: fullPath,
      reason: 'UNMANAGED_USER_FILE',
    };
  }

  if (classification === 'MANAGED_MODIFIED') {
    const conflictFullPath = `${fullPath}.contextos.new`;
    const conflictRelPath = `${normRel}.contextos.new`;
    return {
      action: 'CONFLICT',
      relPath: normRel,
      targetPath: fullPath,
      conflictFullPath,
      conflictPath: conflictRelPath,
      newContent: content,
      newHash,
      reason: 'USER_MODIFIED',
    };
  }

  // MANAGED_CLEAN: check if content changed
  const diskHash = computeFileHash(fullPath);
  if (diskHash === newHash) {
    return {
      action: 'SKIP',
      relPath: normRel,
      targetPath: fullPath,
      reason: 'UP_TO_DATE',
    };
  }

  return {
    action: 'UPDATE',
    relPath: normRel,
    targetPath: fullPath,
    newContent: content,
    oldHash: diskHash,
    newHash,
    reason: 'CONTENT_UPDATED',
  };
}

/**
 * Execute a planned file write operation.
 */
function executeFileWrite(planItem, lockData, { dryRun = false } = {}) {
  if (dryRun) {
    return { ...planItem, executed: false, dryRun: true };
  }

  if (planItem.action === 'SKIP') {
    return { ...planItem, executed: false };
  }

  if (planItem.action === 'CREATE' || planItem.action === 'UPDATE') {
    atomicWriteFile(planItem.targetPath, planItem.newContent);
    if (lockData) {
      recordManagedFile(lockData, planItem.relPath, planItem.newHash || planItem.newContent);
    }
    return { ...planItem, executed: true };
  }

  if (planItem.action === 'CONFLICT') {
    const conflictTarget = planItem.conflictFullPath || `${planItem.targetPath}.contextos.new`;
    atomicWriteFile(conflictTarget, planItem.newContent);
    return {
      ...planItem,
      executed: true,
      conflictPath: planItem.conflictPath || `${planItem.relPath}.contextos.new`,
    };
  }

  return { ...planItem, executed: false };
}

/**
 * Plan a file deletion operation during uninstall or cleanup.
 *
 * Returns ActionPlan:
 * - 'DELETE': Managed file whose disk content matches installation hash (clean)
 * - 'SKIP': File is unmanaged ('UNMANAGED_USER_FILE'), modified by user ('USER_MODIFIED_PRESERVED'),
 *           or already gone ('ALREADY_MISSING').
 */
function planFileDelete({ projectDir, relPath, lockData, options = {} }) {
  const normRel = normalizePath(relPath);
  const fullPath = path.join(projectDir, normRel);
  const classification = classifyFile(projectDir, normRel, lockData);

  if (classification === 'UNMANAGED') {
    return {
      action: 'SKIP',
      relPath: normRel,
      targetPath: fullPath,
      reason: 'UNMANAGED_USER_FILE',
    };
  }

  if (classification === 'MANAGED_MODIFIED') {
    return {
      action: 'SKIP',
      relPath: normRel,
      targetPath: fullPath,
      reason: 'USER_MODIFIED_PRESERVED',
    };
  }

  if (classification === 'MISSING') {
    return {
      action: 'SKIP',
      relPath: normRel,
      targetPath: fullPath,
      reason: 'ALREADY_MISSING',
    };
  }

  return {
    action: 'DELETE',
    relPath: normRel,
    targetPath: fullPath,
    reason: 'MANAGED_CLEAN',
  };
}

/**
 * Execute a planned file deletion operation.
 */
function executeFileDelete(planItem, lockData, { dryRun = false } = {}) {
  if (dryRun) {
    return { ...planItem, executed: false, dryRun: true };
  }

  if (planItem.action === 'DELETE') {
    if (fs.existsSync(planItem.targetPath)) {
      try {
        fs.unlinkSync(planItem.targetPath);
      } catch (err) {
        return { ...planItem, executed: false, error: err.message };
      }
    }

    if (lockData && lockData.managedFiles) {
      delete lockData.managedFiles[planItem.relPath];
    }

    cleanEmptyParentDirectories(planItem.targetPath);
    return { ...planItem, executed: true };
  }

  return { ...planItem, executed: false };
}

module.exports = {
  atomicWriteFile,
  planFileWrite,
  executeFileWrite,
  planFileDelete,
  executeFileDelete,
};
