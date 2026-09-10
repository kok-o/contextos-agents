/**
 * bin/commands/update.js
 * ContextOS CLI — Safe Update Command
 *
 * Updates ContextOS installation non-destructively:
 * - Scans distribution package against target project .agents directory
 * - Plans all mutations: CREATE, UPDATE, CONFLICT, SKIP, DELETE
 * - Never overwrites user-customized files (generates .contextos.new conflicts)
 * - Never touches or deletes unmanaged user files or custom skills
 * - Supports --dry-run to preview changes without modifying filesystem
 */

const fs = require('fs');
const path = require('path');
const {
  loadLockfile,
  saveLockfile,
  migrateExistingInstallation,
  createLockfileData,
} = require('../lib/lockfile.js');
const {
  planFileWrite,
  executeFileWrite,
  planFileDelete,
  executeFileDelete,
} = require('../lib/safe-writer.js');

const pkg = require('../../package.json');

/**
 * Collect all distributable files from the source .agents directory.
 */
function collectDistributionFiles(sourceAgentsDir, options = {}) {
  const files = [];
  const excludedSkills = new Set(options.excludedSkills || []);

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip .git or temp dirs if any
        if (entry.name === '.git' || entry.name === 'node_modules') continue;

        // Skip excluded skills by profile
        const relToAgents = path.relative(sourceAgentsDir, full).replace(/\\/g, '/');
        const coreMatch = relToAgents.match(/^core\/skills\/([^/]+)$/);
        if (coreMatch && excludedSkills.has(coreMatch[1])) {
          continue;
        }
        const genMatch = relToAgents.match(/^generated\/[^/]+\/skills\/([^/]+)$/);
        if (genMatch && excludedSkills.has(genMatch[1])) {
          continue;
        }

        walk(full);
      } else if (entry.isFile()) {
        // Do not distribute lockfile itself or backup files
        if (entry.name === 'contextos.lock.json' || entry.name.endsWith('.bak')) continue;

        const relToAgents = path.relative(sourceAgentsDir, full).replace(/\\/g, '/');
        files.push({
          relPath: `.agents/${relToAgents}`,
          fullSourcePath: full,
        });
      }
    }
  }

  walk(sourceAgentsDir);
  return files;
}

/**
 * Plan the update operations for a project.
 */
function planUpdate(projectDir, sourceAgentsDir, options = {}) {
  const targetAgentsDir = path.join(projectDir, '.agents');
  if (!fs.existsSync(targetAgentsDir)) {
    return {
      ok: false,
      error: 'NO_AGENTS_DIR',
      message: 'No .agents/ directory found in the target project. Run `contextos` to install first.',
      plans: [],
      summary: { create: 0, update: 0, conflict: 0, skip: 0, delete: 0 },
    };
  }

  // Load existing lockfile or safely migrate
  let lockData = loadLockfile(projectDir);
  let migrated = false;
  if (!lockData) {
    lockData = migrateExistingInstallation(projectDir, sourceAgentsDir, {
      dryRun: Boolean(options.dryRun),
      version: pkg.version,
    });
    migrated = true;
  }

  // Determine active profile exclusions if available
  let excludedSkills = [];
  try {
    const profilesPath = path.join(projectDir, '.agents', 'profiles.js');
    if (fs.existsSync(profilesPath)) {
      const profilesModule = require(profilesPath);
      const active = profilesModule.getActiveProfile(projectDir);
      if (active && Array.isArray(active.exclude_skills)) {
        excludedSkills = active.exclude_skills;
      }
    }
  } catch {}

  const distFiles = collectDistributionFiles(sourceAgentsDir, { excludedSkills });
  const distRelPaths = new Set(distFiles.map(f => f.relPath));

  const plans = [];

  // 1. Plan writes for distribution files
  for (const item of distFiles) {
    try {
      const content = fs.readFileSync(item.fullSourcePath, 'utf8');
      const plan = planFileWrite({
        projectDir,
        relPath: item.relPath,
        content,
        lockData,
      });
      plans.push(plan);
    } catch {}
  }

  // 2. Plan deletions for stale managed files that no longer exist in distribution
  if (lockData && lockData.managedFiles) {
    for (const managedRel of Object.keys(lockData.managedFiles)) {
      if (managedRel.startsWith('.agents/') && !distRelPaths.has(managedRel)) {
        const delPlan = planFileDelete({
          projectDir,
          relPath: managedRel,
          lockData,
        });
        plans.push(delPlan);
      }
    }
  }

  const summary = {
    create: plans.filter(p => p.action === 'CREATE').length,
    update: plans.filter(p => p.action === 'UPDATE').length,
    conflict: plans.filter(p => p.action === 'CONFLICT').length,
    skip: plans.filter(p => p.action === 'SKIP').length,
    delete: plans.filter(p => p.action === 'DELETE').length,
  };

  return {
    ok: true,
    lockData,
    migrated,
    plans,
    summary,
  };
}

/**
 * Run the update command against a target project.
 */
function runUpdate(projectDir = process.cwd(), options = {}) {
  const sourceAgentsDir = options.sourceAgentsDir || path.join(__dirname, '..', '..', '.agents');
  const dryRun = Boolean(options.dryRun);

  console.log(`\nContextOS Safe Update ${dryRun ? '[DRY-RUN]' : ''}`);
  console.log(`Target: ${projectDir}`);

  const planned = planUpdate(projectDir, sourceAgentsDir, options);
  if (!planned.ok) {
    console.error(`\n[ERROR] ${planned.message}`);
    return planned;
  }

  const { lockData, plans, summary } = planned;

  // Print classified plan preview
  console.log('\nPlanned Actions:');
  for (const item of plans) {
    if (item.action === 'CREATE') {
      console.log(`  + CREATE    ${item.relPath}`);
    } else if (item.action === 'UPDATE') {
      console.log(`  ~ UPDATE    ${item.relPath}`);
    } else if (item.action === 'CONFLICT') {
      console.log(`  ! CONFLICT  ${item.relPath} → ${item.conflictPath || item.relPath + '.contextos.new'} (customized by user)`);
    } else if (item.action === 'DELETE') {
      console.log(`  - DELETE    ${item.relPath} (stale managed file)`);
    } else if (item.action === 'SKIP' && item.reason === 'UNMANAGED_USER_FILE') {
      console.log(`  = PRESERVE  ${item.relPath} (unmanaged user file)`);
    }
  }

  console.log('\nSummary:');
  console.log(`  Created:    ${summary.create}`);
  console.log(`  Updated:    ${summary.update}`);
  console.log(`  Conflicts:  ${summary.conflict} (written as .contextos.new)`);
  console.log(`  Deleted:    ${summary.delete}`);
  console.log(`  Skipped:    ${summary.skip}`);

  if (dryRun) {
    console.log('\n[DRY-RUN] No changes were written to disk.');
    return { ...planned, executed: false };
  }

  // Execute plans
  let executedCount = 0;
  for (const item of plans) {
    if (item.action === 'CREATE' || item.action === 'UPDATE' || item.action === 'CONFLICT') {
      executeFileWrite(item, lockData, { dryRun: false });
      if (item.action !== 'SKIP') executedCount++;
    } else if (item.action === 'DELETE') {
      executeFileDelete(item, lockData, { dryRun: false });
      executedCount++;
    }
  }

  // Update lockfile metadata
  lockData.version = options.packageVersion || pkg.version;
  lockData.updatedAt = new Date().toISOString();
  saveLockfile(projectDir, lockData);

  console.log(`\n[OK] ContextOS successfully updated to v${lockData.version}!`);
  if (summary.conflict > 0) {
    console.warn(`[WARN] ${summary.conflict} customized file(s) had upstream changes.`);
    console.warn('       Inspect the .contextos.new file(s) to merge upstream updates.');
  }

  // Re-compile if ctx.js exists and not skipped
  if (!options.skipCompile) {
    const ctxPath = path.join(projectDir, '.agents', 'ctx.js');
    if (fs.existsSync(ctxPath)) {
      try {
        const { execFileSync } = require('child_process');
        console.log('\nRecompiling skills...');
        execFileSync(process.execPath, [ctxPath, 'export', 'gemini'], {
          cwd: projectDir,
          stdio: 'inherit',
        });
      } catch (err) {
        console.error(`[ERROR] Post-update compilation failed: ${err.message}`);
        process.exit(1);
      }
    }
  }

  return { ...planned, executed: true, executedCount };
}

module.exports = {
  planUpdate,
  runUpdate,
  collectDistributionFiles,
};
