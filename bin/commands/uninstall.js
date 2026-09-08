/**
 * bin/commands/uninstall.js
 * ContextOS CLI — Safe Uninstall Command
 *
 * Removes ContextOS artifacts safely:
 * - Only deletes clean managed files (content matches installation hash)
 * - Never deletes user-modified managed files (USER_MODIFIED_PRESERVED)
 * - Never deletes user-created custom skills or unmanaged files
 * - Preserves .agents/ directory if user files remain
 * - Removes .agents/ cleanly if no user files remain
 * - Supports --dry-run
 */

const fs = require('fs');
const path = require('path');
const {
  loadLockfile,
  migrateExistingInstallation,
} = require('../lib/lockfile.js');
const {
  planFileDelete,
  executeFileDelete,
} = require('../lib/safe-writer.js');

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
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch {
    return 0;
  }
  return count;
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
      summary: { delete: 0, skipModified: 0, skipUnmanaged: 0, missing: 0 },
    };
  }

  const sourceAgentsDir = options.sourceAgentsDir || path.join(__dirname, '..', '..', '.agents');

  // Load existing lockfile or build migration plan
  let lockData = loadLockfile(projectDir);
  if (!lockData) {
    lockData = migrateExistingInstallation(projectDir, sourceAgentsDir, {
      dryRun: true,
      inMemory: true,
    });
  }

  const plans = [];
  if (lockData && lockData.managedFiles) {
    for (const relPath of Object.keys(lockData.managedFiles)) {
      const plan = planFileDelete({
        projectDir,
        relPath,
        lockData,
      });
      plans.push(plan);
    }
  }

  // Count unmanaged files in .agents that are not in lockData
  const managedSet = new Set(Object.keys(lockData?.managedFiles || {}));
  let unmanagedFilesCount = 0;

  function findUnmanaged(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        findUnmanaged(full);
      } else if (entry.isFile()) {
        if (entry.name === 'contextos.lock.json') continue;
        const rel = path.relative(projectDir, full).replace(/\\/g, '/');
        if (!managedSet.has(rel)) {
          unmanagedFilesCount++;
        }
      }
    }
  }

  findUnmanaged(targetAgentsDir);

  const summary = {
    delete: plans.filter(p => p.action === 'DELETE').length,
    skipModified: plans.filter(p => p.action === 'SKIP' && p.reason === 'USER_MODIFIED_PRESERVED').length,
    missing: plans.filter(p => p.action === 'SKIP' && p.reason === 'ALREADY_MISSING').length,
    skipUnmanaged: unmanagedFilesCount,
  };

  return {
    ok: true,
    plans,
    summary,
    lockData,
  };
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

  const { lockData, plans, summary } = planned;

  console.log('\nPlanned Actions:');
  for (const item of plans) {
    if (item.action === 'DELETE') {
      console.log(`  - DELETE    ${item.relPath}`);
    } else if (item.reason === 'USER_MODIFIED_PRESERVED') {
      console.log(`  = PRESERVE  ${item.relPath} (modified by user — will NOT delete)`);
    }
  }

  if (summary.skipUnmanaged > 0) {
    console.log(`  = PRESERVE  ${summary.skipUnmanaged} unmanaged user file(s)/skill(s) in .agents/`);
  }

  console.log('\nSummary:');
  console.log(`  To delete:     ${summary.delete}`);
  console.log(`  Preserved:     ${summary.skipModified} (user-modified) + ${summary.skipUnmanaged} (user-created)`);

  if (dryRun) {
    console.log('\n[DRY-RUN] No files were deleted.');
    return { ...planned, executed: false };
  }

  // Execute deletions
  let deletedCount = 0;
  for (const item of plans) {
    if (item.action === 'DELETE') {
      const res = executeFileDelete(item, lockData, { dryRun: false });
      if (res.executed) deletedCount++;
    }
  }

  const targetAgentsDir = path.join(projectDir, '.agents');
  const lockfilePath = path.join(targetAgentsDir, 'contextos.lock.json');

  // Count remaining files in .agents (excluding lockfile)
  const remainingFiles = countFiles(targetAgentsDir, new Set(['contextos.lock.json']));

  if (remainingFiles === 0) {
    // Completely clean, remove lockfile and .agents directory
    try {
      if (fs.existsSync(lockfilePath)) fs.unlinkSync(lockfilePath);
      fs.rmSync(targetAgentsDir, { recursive: true, force: true });
      console.log('\n[OK] ContextOS completely uninstalled. .agents/ removed.');
    } catch (err) {
      console.warn(`[WARN] Could not remove .agents directory: ${err.message}`);
    }
  } else {
    // User files or modified files remain — remove lockfile or keep remaining?
    try {
      if (fs.existsSync(lockfilePath)) fs.unlinkSync(lockfilePath);
    } catch {}
    console.log(`\n[OK] Clean ContextOS artifacts uninstalled (${deletedCount} removed).`);
    console.log(`[INFO] .agents/ preserved because ${remainingFiles} user-modified or custom file(s) remain.`);
  }

  return { ...planned, executed: true, deletedCount, remainingFiles };
}

module.exports = {
  planUninstall,
  runUninstall,
};
