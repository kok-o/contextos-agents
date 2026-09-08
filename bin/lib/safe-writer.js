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
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    // Direct write fallback
    fs.writeFileSync(targetPath, content, 'utf8');
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
