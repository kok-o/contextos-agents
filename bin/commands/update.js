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
  ProjectMutationLock,
  JournaledTransaction,
  resolveManagedPath,
} = require('../../.agents/filesystem/index.js');
const {
  loadLockfile,
  LOCKFILE_REL_PATH,
  recordManagedFile,
  migrateExistingInstallation,
} = require('../lib/lockfile.js');
const {
  planFileWrite,
  planFileDelete,
} = require('../lib/safe-writer.js');

const gitignore = require('../lib/gitignore.js');
const pkg = require('../../package.json');
const profiles = require('../../.agents/profiles.js');

// What a project receives from the package: bundled core rules and profile definitions.
function isBundledPayload(relToAgents) {
  return relToAgents === 'AGENTS.md' || relToAgents.startsWith('core/');
}

// Tool code and generated indexes that 2.x init copied into projects; nothing reads them there.
const LEGACY_COPIED_PATHS = [
  '.agents/ctx.js', '.agents/customization-dx.js', '.agents/doctor.js', '.agents/plugins.js',
  '.agents/profiles.js', '.agents/resolver.js', '.agents/stats.js', '.agents/validate.js',
  '.agents/validation-evidence.js', '.agents/watch.js', '.agents/skills.json', '.agents/skills-index.json',
  '.agents/adapters/', '.agents/compiler/', '.agents/filesystem/', '.agents/resolver/', '.agents/rules/',
  '.agents/runtime/', '.agents/schemas/', '.agents/transaction-core/', '.agents/workspace/',
  '.agents/init/', '.agents/catalog/',
];

function isLegacyCopiedPath(relPath) {
  return LEGACY_COPIED_PATHS.some(entry => (entry.endsWith('/') ? relPath.startsWith(entry) : relPath === entry));
}

/**
 * Collect the bundled files from the source .agents directory.
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
        if (!options.everything && !isBundledPayload(relToAgents)) continue;
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

  // Validate before reading/migrating state or creating a mutation lock.
  resolveManagedPath(projectDir, '.agents');
  resolveManagedPath(projectDir, LOCKFILE_REL_PATH);

  // Load existing lockfile or safely migrate
  let lockData = loadLockfile(projectDir);
  let migrated = false;
  if (!lockData) {
    lockData = migrateExistingInstallation(projectDir, sourceAgentsDir, {
      inMemory: true,
      version: pkg.version,
    });
    migrated = true;
  }

  // Determine active profile exclusions if available
  let excludedSkills = [];
  try {
    const active = profiles.getActiveProfile(projectDir);
    if (active && Array.isArray(active.exclude_skills)) {
      excludedSkills = active.exclude_skills;
    }
  } catch {}

  // Only a project that already carries the bundled core receives refreshed core files; update never opts a project in.
  const hasBundledCore = fs.existsSync(path.join(targetAgentsDir, 'core')) || fs.existsSync(path.join(targetAgentsDir, 'AGENTS.md'));
  const distFiles = hasBundledCore ? collectDistributionFiles(sourceAgentsDir, { excludedSkills }) : [];
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
      const inBundledArea = isBundledPayload(managedRel.replace(/^\.agents\//, ''));
      if (managedRel.startsWith('.agents/') && !distRelPaths.has(managedRel) && (inBundledArea || isLegacyCopiedPath(managedRel))) {
        const delPlan = planFileDelete({
          projectDir,
          relPath: managedRel,
          lockData,
        });
        plans.push(delPlan);
      }
    }
  }

  // 3. The catalog copy that 2.x init placed in the project: unmodified files are the package's own, kept nowhere else needed.
  const { planLegacyCatalogCopies } = require('./uninstall.js');
  const alreadyPlanned = new Set(plans.map(plan => plan.relPath));
  for (const copy of planLegacyCatalogCopies(projectDir, sourceAgentsDir, alreadyPlanned)) {
    plans.push({ action: 'DELETE', relPath: copy.relPath, targetPath: copy.targetPath, reason: 'LEGACY_CATALOG_COPY' });
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
  
  const lock = new ProjectMutationLock(projectDir);
  const lockToken = lock.acquire({ command: 'update' });

  try {
    const tx = new JournaledTransaction(projectDir);

    for (const item of plans) {
      if (item.action === 'CREATE' || item.action === 'UPDATE' || item.action === 'CONFLICT') {
        const targetRel = item.action === 'CONFLICT' ? (item.conflictPath || `${item.relPath}.contextos.new`) : item.relPath;
        tx.stageWrite(targetRel, item.newContent);
        if (item.action !== 'SKIP') executedCount++;
      } else if (item.action === 'DELETE') {
        tx.stageDeleteWithParents(item.relPath);
        executedCount++;
      }
    }

    // Derived caches and journals stay out of version control (init adds the same block to new projects).
    const currentIgnore = gitignore.readGitignore(projectDir);
    const nextIgnore = gitignore.withBlock(currentIgnore);
    if (nextIgnore !== currentIgnore) tx.stageWrite('.gitignore', nextIgnore);

    if (lockData) {
      for (const item of plans) {
        if (item.action === 'CREATE' || item.action === 'UPDATE') {
          recordManagedFile(lockData, item.relPath, item.newContent);
        } else if (item.action === 'DELETE') {
          if (lockData.managedFiles) delete lockData.managedFiles[item.relPath];
        }
      }
      lockData.version = options.packageVersion || pkg.version;
      tx.stageWrite(LOCKFILE_REL_PATH, JSON.stringify(lockData, null, 2) + '\n');
    }

    tx.commit();

  } finally {
    lock.release(lockToken);
  }

  console.log(`\n[OK] ContextOS successfully updated!`);
  if (summary.conflict > 0) {
    console.warn(`[WARN] ${summary.conflict} customized file(s) had upstream changes.`);
    console.warn('       Inspect the .contextos.new file(s) to merge upstream updates.');
  }

  // Refresh the agent files the project already exports; a project that never exported has nothing to refresh.
  if (!options.skipCompile && fs.existsSync(path.join(projectDir, '.agents', 'lockfile.v2.json'))) {
    // Run the compiler shipped with this package. The project's .agents/ctx.js
    // is user-controlled and must never be executed implicitly during update.
    const ctxPath = path.join(sourceAgentsDir, 'ctx.js');
    if (fs.existsSync(ctxPath)) {
      try {
        const { execFileSync } = require('child_process');
        console.log('\nRe-exporting agent files...');
        execFileSync(process.execPath, [ctxPath, 'export', 'all'], {
          cwd: projectDir,
          stdio: 'inherit',
        });
      } catch (err) {
        console.error(`[ERROR] Post-update export failed: ${err.message}`);
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
