/**
 * .agents/init/init-engine.js
 * ContextOS — Interactive & Deterministic Project Initialization Engine
 *
 * Implements the Milestone 8 Init State Machine:
 * DISCOVER ──▶ PLAN ──▶ STAGE ──▶ VALIDATE ──▶ COMMIT ──▶ REPORT
 *
 * Guarantees:
 * - Deterministic plan: Dry-run and execution share the exact same InitPlan object
 * - Zero data loss: Unmanaged user files are never overwritten or deleted
 * - Crash-resilient transaction: All file changes staged in JournaledTransaction
 * - Strict validation gate: Fails & rolls back if manifest validation fails (unless --allow-partial)
 * - Idempotency: Repeated init runs on clean project result in zero changes
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  resolveManagedPath,
  toPosix,
  ProjectMutationLock,
  JournaledTransaction,
  LockfileV2Manager,
  computeExactHash,
  computeSemanticHash,
} = require('../filesystem/index.js');
const { WorkspaceGraphBuilder } = require('../workspace/workspace-graph.js');
const profiles = require('../profiles.js');

const MINIMAL_SKILLS = new Set([
  'engineering-workflow',
  'ponytail-mindset',
  'gstack-roles',
  'gemini-precision',
  'react',
]);

/**
 * Computes hash normalized for line-endings.
 */
function computeNormalizedHash(content) {
  const str = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * 1. DISCOVER: Inspects workspace structure, dependencies, and environments.
 */
function discover(projectRoot, options = {}) {
  const absRoot = path.resolve(projectRoot);
  const graphBuilder = new WorkspaceGraphBuilder();
  const workspaceGraph = graphBuilder.build(absRoot);

  let stack = { detected: [], recommendedProfile: 'default' };
  try {
    stack = profiles.detectStack(absRoot);
  } catch {}

  const packagesCount = workspaceGraph.packages?.length || 1;
  const recommendedProfile = options.profile || stack.recommendedProfile || 'default';

  // Calculate detection confidence based on evidence weights
  let confidence = 0.75;
  if (stack.detected.length > 2) confidence = 0.92;
  else if (stack.detected.length > 0) confidence = 0.85;

  // Determine target adapters
  const adapters = [];
  if (fs.existsSync(path.join(absRoot, '.cursor')) || fs.existsSync(path.join(absRoot, '.cursorrules'))) {
    adapters.push('cursor');
  }
  if (fs.existsSync(path.join(absRoot, '.zed'))) {
    adapters.push('zed');
  }
  if (fs.existsSync(path.join(absRoot, '.github'))) {
    adapters.push('copilot');
  }
  if (adapters.length === 0) {
    adapters.push('cursor', 'claude', 'gemini');
  }

  return {
    projectRoot: absRoot,
    workspaceGraph,
    packagesCount,
    detectedStack: stack.detected,
    recommendedProfile,
    confidence,
    adapters,
  };
}

/**
 * Collects distribution files from package's .agents directory.
 */
function collectDistributionFiles(sourceAgentsDir, options = {}) {
  const files = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relToSource = toPosix(path.relative(sourceAgentsDir, fullPath));

      if (!options.withMcp) {
        if (relToSource === 'mcp' || relToSource.startsWith('mcp/') || relToSource === 'mcp_config.json') {
          continue;
        }
      }

      if (options.minimal) {
        const skillMatch = relToSource.match(/^core\/skills\/([^/]+)/);
        if (skillMatch && !MINIMAL_SKILLS.has(skillMatch[1])) {
          continue;
        }
        const genMatch = relToSource.match(/^generated\/gemini\/skills\/([^/]+)/);
        if (genMatch && !MINIMAL_SKILLS.has(genMatch[1])) {
          continue;
        }
      }

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        files.push({
          relPath: `.agents/${relToSource}`,
          absPath: fullPath,
          size: fs.statSync(fullPath).size,
        });
      }
    }
  }

  if (fs.existsSync(sourceAgentsDir)) {
    scan(sourceAgentsDir);
  }

  return files;
}

/**
 * 2. PLAN: Generates a deterministic InitPlan without modifying disk.
 */
function planInit(projectRoot, distributionAgentsDir, options = {}) {
  const discovery = discover(projectRoot, options);
  const targetRoot = discovery.projectRoot;
  const distFiles = collectDistributionFiles(distributionAgentsDir, options);

  const lockfileManager = new LockfileV2Manager(targetRoot);
  const existingLockfile = lockfileManager.read();

  const actions = [];
  let createCount = 0;
  let updateCount = 0;
  let conflictCount = 0;
  let skipCount = 0;
  let estimatedFootprintBytes = 0;

  for (const file of distFiles) {
    const targetFilePath = path.join(targetRoot, file.relPath);
    estimatedFootprintBytes += file.size;

    if (!fs.existsSync(targetFilePath)) {
      actions.push({
        action: 'CREATE',
        relPath: file.relPath,
        sourcePath: file.absPath,
        reason: 'New distribution file',
      });
      createCount++;
      continue;
    }

    // Target file exists — compare content
    const sourceContent = fs.readFileSync(file.absPath);
    const targetContent = fs.readFileSync(targetFilePath);

    const sourceHash = computeNormalizedHash(sourceContent);
    const targetHash = computeNormalizedHash(targetContent);

    if (sourceHash === targetHash) {
      actions.push({
        action: 'SKIP',
        relPath: file.relPath,
        sourcePath: file.absPath,
        reason: 'Identical content',
      });
      skipCount++;
      continue;
    }

    // File exists with differing content
    if (options.force) {
      actions.push({
        action: 'UPDATE',
        relPath: file.relPath,
        sourcePath: file.absPath,
        reason: 'Forced overwrite',
      });
      updateCount++;
      continue;
    }

    // Check if recorded in lockfile as clean
    const isCleanInLock = existingLockfile?.managedFiles?.[file.relPath]?.exactSha256 === computeExactHash(targetContent);
    if (isCleanInLock) {
      actions.push({
        action: 'UPDATE',
        relPath: file.relPath,
        sourcePath: file.absPath,
        reason: 'Upstream update to clean managed file',
      });
      updateCount++;
    } else {
      // User conflict: preserve user file and stage conflict sidecar
      actions.push({
        action: 'CONFLICT',
        relPath: `${file.relPath}.contextos.new`,
        originalPath: file.relPath,
        sourcePath: file.absPath,
        reason: 'User-modified file conflict (sidecar written)',
      });
      conflictCount++;
    }
  }

  return {
    stages: ['DISCOVER', 'PLAN', 'STAGE', 'VALIDATE', 'COMMIT', 'REPORT'],
    discovery,
    actions,
    summary: {
      detectedProfile: discovery.recommendedProfile,
      confidence: discovery.confidence,
      workspacePackages: discovery.packagesCount,
      adapters: discovery.adapters,
      create: createCount,
      update: updateCount,
      conflicts: conflictCount,
      skipped: skipCount,
      estimatedFootprintBytes,
      runtime: 'disabled',
    },
  };
}

/**
 * 3. VALIDATE: Validates the staged installation before committing.
 */
function validateStagedFiles(stagedFiles) {
  const errors = [];
  for (const file of stagedFiles) {
    if (file.relPath.endsWith('SKILL.md')) {
      const content = file.content.toString('utf8');
      if (!content.startsWith('---') || !content.includes('name:')) {
        errors.push(`Invalid frontmatter in ${file.relPath}`);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * EXECUTE INIT: Runs the complete 6-stage lifecycle using JournaledTransaction.
 */
function executeInit(projectRoot, distributionAgentsDir, options = {}) {
  const plan = planInit(projectRoot, distributionAgentsDir, options);
  const targetRoot = plan.discovery.projectRoot;

  // Format pre-execution status
  const planReport = [
    `Detected profile: ${plan.summary.detectedProfile}`,
    `Confidence: ${plan.summary.confidence.toFixed(2)}`,
    `Workspace packages: ${plan.summary.workspacePackages}`,
    `Adapters: ${plan.summary.adapters.join(', ')}`,
    `Create: ${plan.summary.create}`,
    `Update: ${plan.summary.update}`,
    `Conflicts: ${plan.summary.conflicts}`,
    `Estimated footprint: ${Math.round(plan.summary.estimatedFootprintBytes / 1024)} KB`,
    `Runtime: ${plan.summary.runtime}`,
  ].join('\n');

  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      report: planReport,
      plan,
    };
  }

  const lock = new ProjectMutationLock(targetRoot);
  const lockToken = lock.acquire({ command: 'init' });

  try {
    const tx = new JournaledTransaction(targetRoot);
    const stagedFiles = [];

    // Stage all planned writes
    for (const action of plan.actions) {
      if (action.action === 'SKIP') continue;

      const content = fs.readFileSync(action.sourcePath);
      tx.stageWrite(action.relPath, content);
      stagedFiles.push({
        relPath: action.relPath,
        content,
      });
    }

    // 4. VALIDATE
    const validation = validateStagedFiles(stagedFiles);
    if (!validation.valid && !options.allowPartial) {
      const diagRelPath = '.agents/init-diagnostics.json';
      const diagPath = path.join(targetRoot, diagRelPath);
      const diagnosticsData = {
        timestamp: new Date().toISOString(),
        profile: plan.summary.detectedProfile,
        stage: 'VALIDATE',
        errors: validation.errors,
        stagedFilesCount: stagedFiles.length,
      };
      
      tx.rollback();
      
      try {
        const diagTx = new JournaledTransaction(targetRoot);
        diagTx.stageWrite(diagRelPath, JSON.stringify(diagnosticsData, null, 2));
        diagTx.commit();
      } catch {}

      const err = new Error(`Init validation failed with ${validation.errors.length} error(s):\n${validation.errors.join('\n')}\nDiagnostics saved to ${diagPath}`);
      err.code = 'CTX_INIT_VALIDATION_FAILED';
      throw err;
    }

    // 5. COMMIT
    const txResult = tx.commit();

    // 6. RECORD LOCKFILE
    const lockfileManager = new LockfileV2Manager(targetRoot);
    const lockfileData = lockfileManager.read() || lockfileManager.createEmpty({
      profileId: plan.summary.detectedProfile,
      enabledAdapters: plan.summary.adapters,
    });

    for (const staged of stagedFiles) {
      if (!staged.relPath.endsWith('.contextos.new')) {
        lockfileManager.recordManagedFile(lockfileData, staged.relPath, {
          exactSha256: computeExactHash(staged.content),
          semanticTextSha256: computeSemanticHash(staged.content),
          kind: 'distribution-skill',
          generator: 'init@2',
          lastTransaction: txResult.txId,
        });
      }
    }
    lockfileManager.write(lockfileData);

    // 7. PROTECT REPOSITORY: Ensure local runtime files & mcp_config are gitignored
    ensureGitignore(targetRoot);

    return {
      success: true,
      txId: txResult.txId,
      report: planReport,
      plan,
    };
  } finally {
    lock.release(lockToken);
  }
}

const CONTEXTOS_GITIGNORE_ENTRIES = [
  '# ContextOS local runtime & machine configs',
  '.agents/mcp_config.json',
  '.agents/.contextos/',
  '.agents/cache/',
  '.agents/state/',
  '.agents/transactions/',
  '.agents/mcp/',
  '.contextos-worktrees/',
  '.swarm-worktrees/',
];

function ensureGitignore(targetRoot) {
  const gitignorePath = path.join(targetRoot, '.gitignore');
  try {
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, `${CONTEXTOS_GITIGNORE_ENTRIES.join('\n')}\n`, 'utf8');
      return true;
    }
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.agents/mcp_config.json')) {
      const sep = content.endsWith('\n') ? '' : '\n';
      fs.writeFileSync(gitignorePath, `${content}${sep}\n${CONTEXTOS_GITIGNORE_ENTRIES.join('\n')}\n`, 'utf8');
      return true;
    }
  } catch {}
  return false;
}

module.exports = {
  discover,
  planInit,
  validateStagedFiles,
  executeInit,
  ensureGitignore,
};
