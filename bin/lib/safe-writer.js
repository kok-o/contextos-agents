/**
 * bin/lib/safe-writer.js
 * Conflict planning for files that ContextOS installed into a project.
 *
 * This module only decides; it never touches the disk. Applying a plan goes
 * through the journaled transaction (.agents/filesystem), which is the single
 * write path and refuses symlink or junction escapes. It implements:
 * - Classified actions: CREATE, UPDATE, CONFLICT, SKIP, DELETE
 * - Unmanaged user-created files are NEVER touched or deleted
 * - User-modified managed files trigger a sidecar (.contextos.new) instead of an overwrite
 */

const fs = require('fs');
const path = require('path');
const {
  normalizePath,
  computeHash,
} = require('./lockfile.js');
const { computeExactHash } = require('../../.agents/filesystem/lockfile-v2.js');
const { resolveManagedPath } = require('../../.agents/filesystem/safe-path.js');

// Classification and the eventual transaction precondition must describe the
// same read. Installation hashes normalize CRLF; mutation hashes retain bytes.
function inspectFile(fullPath, record) {
  let content = null;
  try { content = fs.readFileSync(fullPath); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  const diskHash = content === null ? null : computeHash(content.toString('utf8'));
  return {
    beforeHash: content === null ? 'NONE' : computeExactHash(content),
    diskHash,
    classification: !record?.managed ? 'UNMANAGED' : content === null ? 'MISSING'
      : diskHash === record.sha256 ? 'MANAGED_CLEAN' : 'MANAGED_MODIFIED',
  };
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
  const snapshot = inspectFile(fullPath, lockData?.managedFiles?.[normRel]);

  if (snapshot.beforeHash === 'NONE') {
    return {
      action: 'CREATE',
      relPath: normRel,
      targetPath: fullPath,
      newContent: content,
      newHash,
      expectedBeforeHash: 'NONE',
      reason: 'NEW_FILE',
    };
  }

  const classification = snapshot.classification;

  if (classification === 'UNMANAGED') {
    return {
      action: 'SKIP',
      relPath: normRel,
      targetPath: fullPath,
      reason: 'UNMANAGED_USER_FILE',
    };
  }

  if (classification === 'MANAGED_MODIFIED') {
    // Sidecars are not managed installation files. An existing sidecar may
    // hold a user's unfinished merge, even if we originally created it.
    // lstat reserves all existing entries, including dangling symlinks, without
    // reading or following them. Only the unused name becomes a write target.
    let suffix = 0;
    let conflictRelPath;
    let conflictFullPath;
    while (true) {
      conflictRelPath = `${normRel}.contextos.new${suffix ? `.${suffix}` : ''}`;
      conflictFullPath = path.join(projectDir, conflictRelPath);
      try { fs.lstatSync(conflictFullPath); }
      catch (err) {
        if (err.code !== 'ENOENT') throw err;
        break;
      }
      suffix++;
    }
    resolveManagedPath(projectDir, conflictRelPath);
    return {
      action: 'CONFLICT',
      relPath: normRel,
      targetPath: fullPath,
      conflictFullPath,
      conflictPath: conflictRelPath,
      newContent: content,
      newHash,
      expectedBeforeHash: 'NONE',
      reason: 'USER_MODIFIED',
    };
  }

  // MANAGED_CLEAN: check if content changed
  const diskHash = snapshot.diskHash;
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
    expectedBeforeHash: snapshot.beforeHash,
    newHash,
    reason: 'CONTENT_UPDATED',
  };
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
  const snapshot = inspectFile(fullPath, lockData?.managedFiles?.[normRel]);
  const classification = snapshot.classification;

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
    expectedBeforeHash: snapshot.beforeHash,
  };
}

module.exports = {
  planFileWrite,
  planFileDelete,
};
