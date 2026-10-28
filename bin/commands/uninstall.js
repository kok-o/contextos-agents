/**
 * bin/commands/uninstall.js
 * ContextOS CLI — Safe Uninstall Command
 *
 * Removes what ContextOS put into a project, and only that:
 *  - generated agent files recorded in the lockfile, when they still match what
 *    ContextOS wrote (files you edited are kept and reported)
 *  - the managed block inside files that also hold your text (Copilot
 *    instructions, an older CLAUDE.md); the file is deleted only if nothing else is left
 *  - bundled core files copied by an earlier init (lockfile v1), when unmodified
 *  - lockfiles, derived caches, transaction journals and the .gitignore block
 *
 * Rule sources under .agents/project/, plugins and any unmanaged file are never touched.
 * Every change goes through the journaled transaction, which refuses paths that
 * leave the project through a symlink or junction.
 */

const fs = require('fs');
const path = require('path');
const {
  loadLockfile,
  migrateExistingInstallation,
  computeFileHash,
} = require('../lib/lockfile.js');
const { planFileDelete } = require('../lib/safe-writer.js');
const gitignore = require('../lib/gitignore.js');
const {
  LockfileV2Manager,
  ProjectMutationLock,
  JournaledTransaction,
  resolveManagedPath,
  removeManagedBlock,
  computeExactHash,
  ownsDiskFile,
  isStrictBoundedRule,
  TEXT_EXTENSION,
  CONTEXTOS_BLOCK_START,
  CONTEXTOS_BLOCK_END,
} = require('../../.agents/filesystem/index.js');

const BLOCK_FILES = new Set(['CLAUDE.md', '.github/copilot-instructions.md']);
const LOCKFILES = ['.agents/lockfile.v2.json', '.agents/contextos.lock.json'];
const TOOL_STATE = ['.agents/compiled', '.agents/.contextos'];

/**
 * Recursively count all files remaining in a directory (excluding specified skip names).
 */
function countFiles(dir, skipNames = new Set()) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;

  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipNames.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(full, skipNames);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        count++;
      }
    }
  } catch {
    return 0;
  }
  return count;
}

function walkFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function readV2(projectDir) {
  try {
    return new LockfileV2Manager(projectDir).read({ tolerateConflicts: true });
  } catch {
    return null;
  }
}

/** A generated file that is recorded in lockfile v2: delete it, strip its block, or leave it. */
function planGeneratedFile(projectDir, relPath, record, v2) {
  const targetPath = path.join(projectDir, ...relPath.split('/'));
  if (!fs.existsSync(targetPath)) return { action: 'SKIP', relPath, targetPath, reason: 'ALREADY_MISSING' };

  const diskBuf = fs.readFileSync(targetPath);
  const beforeHash = computeExactHash(diskBuf);

  if (record.userContent || BLOCK_FILES.has(relPath) || relPath === '.aider.conf.yml') {
    let stripped;
    try {
      stripped = removeManagedBlock(diskBuf.toString('utf8'), CONTEXTOS_BLOCK_START, CONTEXTOS_BLOCK_END, relPath);
    } catch (err) {
      return { action: 'SKIP', relPath, targetPath, reason: 'USER_MODIFIED_PRESERVED', detail: err.message };
    }
    if (stripped.found) {
      if (stripped.content.trim() === '') return { action: 'DELETE', relPath, targetPath, beforeHash };
      return { action: 'STRIP_BLOCK', relPath, targetPath, beforeHash, newContent: stripped.content };
    }
    // A text file that never held a block has nothing of ours left in it.
    if (BLOCK_FILES.has(relPath)) return { action: 'SKIP', relPath, targetPath, reason: 'ALREADY_MISSING' };
    // A merged settings file has no separable managed block. Its last exported
    // hash includes the user's settings too, so matching it proves no ownership.
    // Keep the whole file rather than guessing which YAML values were ours.
    return { action: 'SKIP', relPath, targetPath, reason: 'SHARED_CONFIG_PRESERVED' };
  }

  const owned = ownsDiskFile({
    diskBuf,
    textLike: TEXT_EXTENSION.test(relPath),
    existing: record,
    alternates: v2?.recovered?.alternates?.[relPath] || [],
    strict: isStrictBoundedRule(relPath, record),
  });
  return owned
    ? { action: 'DELETE', relPath, targetPath, beforeHash }
    : { action: 'SKIP', relPath, targetPath, reason: 'USER_MODIFIED_PRESERVED' };
}

/** Skill files that an older init copied from the package catalog and nobody edited. */
function planLegacyCatalogCopies(projectDir, sourceAgentsDir, alreadyPlanned) {
  const copied = path.join(projectDir, '.agents', 'catalog', 'skills');
  const packageCatalog = path.join(sourceAgentsDir, '..', 'catalog', 'skills');
  const plans = [];
  for (const file of walkFiles(copied)) {
    const relPath = path.relative(projectDir, file).split(path.sep).join('/');
    if (alreadyPlanned.has(relPath)) continue;
    const source = path.join(packageCatalog, path.relative(copied, file));
    if (!fs.existsSync(source)) continue;
    const diskHash = computeFileHash(file);
    if (diskHash && diskHash === computeFileHash(source)) {
      plans.push({ action: 'DELETE', relPath, targetPath: file, beforeHash: computeExactHash(fs.readFileSync(file)) });
    }
  }
  return plans;
}

/**
 * Plan uninstallation for a target project.
 */
function planUninstall(projectDir, options = {}) {
  const targetAgentsDir = path.join(projectDir, '.agents');
  if (!fs.existsSync(targetAgentsDir)) {
    return {
      ok: false,
      error: 'NO_AGENTS_DIR',
      message: 'No .agents/ directory found in the target project. Nothing to uninstall.',
      plans: [],
      summary: { delete: 0, stripBlock: 0, skipModified: 0, skipShared: 0, skipUnmanaged: 0, missing: 0 },
    };
  }

  const sourceAgentsDir = options.sourceAgentsDir || path.join(__dirname, '..', '..', '.agents');

  const v2 = readV2(projectDir);
  let lockData = loadLockfile(projectDir);
  if (!lockData && !v2) {
    // No lockfile at all: claim only files that are byte-identical to the package.
    lockData = migrateExistingInstallation(projectDir, sourceAgentsDir, { dryRun: true, inMemory: true });
  }

  const plans = [];
  const planned = new Set();

  for (const [relPath, record] of Object.entries(v2?.managedFiles || {})) {
    plans.push(planGeneratedFile(projectDir, relPath, record, v2));
    planned.add(relPath);
  }

  for (const relPath of Object.keys(lockData?.managedFiles || {})) {
    if (planned.has(relPath)) continue;
    const plan = planFileDelete({ projectDir, relPath, lockData });
    if (plan.action === 'DELETE') plan.beforeHash = computeExactHash(fs.readFileSync(plan.targetPath));
    plans.push(plan);
    planned.add(relPath);
  }

  plans.push(...planLegacyCatalogCopies(projectDir, sourceAgentsDir, planned));
  for (const plan of plans) planned.add(plan.relPath);

  // Files under .agents/ that ContextOS did not put there and will not remove.
  const protectedNames = new Set(['contextos.lock.json', 'lockfile.v2.json']);
  let unmanagedFilesCount = 0;
  for (const file of walkFiles(targetAgentsDir)) {
    const rel = path.relative(projectDir, file).split(path.sep).join('/');
    if (planned.has(rel) || protectedNames.has(path.basename(file))) continue;
    if (TOOL_STATE.some(prefix => rel.startsWith(`${prefix}/`))) continue;
    unmanagedFilesCount++;
  }

  const count = predicate => plans.filter(predicate).length;
  const summary = {
    delete: count(p => p.action === 'DELETE'),
    stripBlock: count(p => p.action === 'STRIP_BLOCK'),
    skipModified: count(p => p.action === 'SKIP' && p.reason === 'USER_MODIFIED_PRESERVED'),
    skipShared: count(p => p.action === 'SKIP' && p.reason === 'SHARED_CONFIG_PRESERVED'),
    missing: count(p => p.action === 'SKIP' && p.reason === 'ALREADY_MISSING'),
    skipUnmanaged: unmanagedFilesCount,
  };

  return { ok: true, plans, summary, lockData, lockfileV2: v2 };
}

function removeToolState(projectDir) {
  for (const rel of TOOL_STATE) {
    const target = path.join(projectDir, ...rel.split('/'));
    if (!fs.existsSync(target)) continue;
    try {
      resolveManagedPath(projectDir, rel);
      if (rel === '.agents/.contextos') {
        // The uninstall lock must remain live throughout cleanup. Removing its
        // parent would let another writer acquire the project mid-uninstall.
        for (const entry of fs.readdirSync(target)) {
          if (entry === 'locks') continue;
          const childRel = `${rel}/${entry}`;
          const { resolvedPath } = resolveManagedPath(projectDir, childRel);
          fs.rmSync(resolvedPath, { recursive: true, force: true });
        }
      } else {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch {
      // A derived cache that cannot be removed is not worth failing the uninstall for.
    }
  }
}

/**
 * Run safe uninstall against a target project.
 */
function runUninstall(projectDir = process.cwd(), options = {}) {
  const dryRun = Boolean(options.dryRun);

  console.log(`\nContextOS Safe Uninstall ${dryRun ? '[DRY-RUN]' : ''}`);
  console.log(`Target: ${projectDir}`);

  const planned = planUninstall(projectDir, options);
  if (!planned.ok) {
    console.error(`\n[ERROR] ${planned.message}`);
    return planned;
  }

  const { plans, summary } = planned;

  console.log('\nPlanned Actions:');
  for (const item of plans) {
    if (item.action === 'DELETE') {
      console.log(`  - DELETE    ${item.relPath}`);
    } else if (item.action === 'STRIP_BLOCK') {
      console.log(`  ~ STRIP     ${item.relPath} (removes the ContextOS block, keeps your text)`);
    } else if (item.reason === 'USER_MODIFIED_PRESERVED') {
      console.log(`  = PRESERVE  ${item.relPath} (modified by user — will NOT delete)${item.detail ? `: ${item.detail}` : ''}`);
    } else if (item.reason === 'SHARED_CONFIG_PRESERVED') {
      console.log(`  = PRESERVE  ${item.relPath} (shared settings; remove obsolete CONVENTIONS.md references manually)`);
    }
  }

  if (summary.skipUnmanaged > 0) {
    console.log(`  = PRESERVE  ${summary.skipUnmanaged} unmanaged user file(s)/skill(s) in .agents/`);
  }

  console.log('\nSummary:');
  console.log(`  To delete:     ${summary.delete}`);
  console.log(`  Block strips:  ${summary.stripBlock}`);
  console.log(`  Preserved:     ${summary.skipModified} (user-modified) + ${summary.skipShared} (shared settings) + ${summary.skipUnmanaged} (user-created)`);

  if (dryRun) {
    console.log('\n[DRY-RUN] No files were deleted.');
    return { ...planned, executed: false };
  }

  const lock = new ProjectMutationLock(projectDir);
  const token = lock.acquire({ command: 'uninstall' });
  let deletedCount = 0;
  const outsideProject = [];
  try {
    resolveManagedPath(projectDir, '.agents/.contextos/transactions');
    const pending = JournaledTransaction.listPending(projectDir);
    if (pending.length > 0) {
      const message = `Uninstall blocked: pending transactions require explicit recovery (${pending.map(tx => tx.txId).join(', ')}). Run contextos recover; journals and backups were preserved.`;
      console.error(`\n[ERROR] ${message}`);
      return { ...planned, ok: false, executed: false, error: 'CTX_TX_RECOVERY_REQUIRED', message, pending };
    }
    const tx = new JournaledTransaction(projectDir);
    for (const item of plans) {
      try {
        if (item.action === 'DELETE') {
          tx.stageDeleteWithParents(item.relPath, { expectedBeforeHash: item.beforeHash });
          deletedCount++;
        } else if (item.action === 'STRIP_BLOCK') {
          tx.stageWrite(item.relPath, item.newContent, { expectedBeforeHash: item.beforeHash });
          deletedCount++;
        }
      } catch (err) {
        if (err.code && String(err.code).startsWith('CTX_PATH')) {
          outsideProject.push(item.relPath);
          continue;
        }
        throw err;
      }
    }

    for (const rel of LOCKFILES) {
      if (fs.existsSync(path.join(projectDir, ...rel.split('/')))) tx.stageDelete(rel);
    }

    const currentIgnore = gitignore.readGitignore(projectDir);
    if (currentIgnore) {
      const stripped = gitignore.withoutBlock(currentIgnore);
      if (stripped.found) {
        if (stripped.content.trim() === '') tx.stageDelete('.gitignore');
        else tx.stageWrite('.gitignore', stripped.content);
      }
    }

    if (tx.operations.length > 0) tx.commit();
    removeToolState(projectDir);
  } finally {
    lock.release(token);
  }

  // Only empty directories can be removed after releasing the lock. A new
  // writer or user-created entry makes rmdir fail rather than being erased.
  for (const rel of ['.agents/.contextos/locks', '.agents/.contextos']) {
    try {
      const { resolvedPath } = resolveManagedPath(projectDir, rel);
      fs.rmdirSync(resolvedPath);
    } catch { /* Nonempty, missing, or unsafe: leave it alone. */ }
  }

  const targetAgentsDir = path.join(projectDir, '.agents');
  const remainingFiles = countFiles(targetAgentsDir);

  if (outsideProject.length > 0) {
    console.warn(`\n[WARN] Skipped ${outsideProject.length} path(s) that leave the project through a symlink or junction:`);
    for (const rel of outsideProject) console.warn(`       ${rel}`);
  }

  if (remainingFiles === 0) {
    try {
      resolveManagedPath(projectDir, '.agents');
      fs.rmdirSync(targetAgentsDir);
      console.log('\n[OK] ContextOS completely uninstalled. .agents/ removed.');
    } catch (err) {
      console.warn(`[WARN] Could not remove .agents directory: ${err.message}`);
    }
  } else {
    console.log(`\n[OK] ContextOS files uninstalled (${deletedCount} removed or cleaned).`);
    console.log(`[INFO] .agents/ preserved because ${remainingFiles} rule source, user-modified or custom file(s) remain.`);
  }

  return { ...planned, executed: true, deletedCount, remainingFiles, outsideProject };
}

module.exports = {
  planUninstall,
  runUninstall,
  planLegacyCatalogCopies,
};
