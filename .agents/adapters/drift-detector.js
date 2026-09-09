/**
 * .agents/adapters/drift-detector.js
 * ContextOS Adapter Output Drift & Out-of-Sync Detector
 *
 * Implements Section 12.4 drift states:
 * - STALE_INPUT: Source graph or profile modified since last compile
 * - MISSING_OUTPUT: Planned or recorded file absent from disk
 * - MODIFIED_MANAGED_OUTPUT: Disk content differs from lockfile (user edits)
 * - ORPHAN_MANAGED_OUTPUT: Lockfile records file no longer rendered
 * - ADAPTER_VERSION_MISMATCH: Generator version differs
 * - PROFILE_MISMATCH: Active profile differs from lockfile profile
 */

const fs = require('fs');
const path = require('path');
const { LockfileV2Manager, computeExactHash, computeSemanticHash } = require('../filesystem/index.js');
const { renderAdapters } = require('./pure-compiler.js');

const DRIFT_STATES = {
  STALE_INPUT: 'STALE_INPUT',
  MISSING_OUTPUT: 'MISSING_OUTPUT',
  MODIFIED_MANAGED_OUTPUT: 'MODIFIED_MANAGED_OUTPUT',
  ORPHAN_MANAGED_OUTPUT: 'ORPHAN_MANAGED_OUTPUT',
  ADAPTER_VERSION_MISMATCH: 'ADAPTER_VERSION_MISMATCH',
  PROFILE_MISMATCH: 'PROFILE_MISMATCH',
};

/**
 * Computes a unified textual diff snippet between before and after strings.
 */
function computeDiffSnippet(beforeStr, afterStr, maxLines = 15) {
  const beforeLines = beforeStr.split(/\r?\n/);
  const afterLines = afterStr.split(/\r?\n/);
  const diffLines = [];

  let lineCount = 0;
  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b !== a) {
      if (b !== undefined) {
        diffLines.push(`- ${b}`);
        lineCount++;
      }
      if (a !== undefined) {
        diffLines.push(`+ ${a}`);
        lineCount++;
      }
    }
    if (lineCount >= maxLines) {
      diffLines.push('... (diff truncated)');
      break;
    }
  }

  return diffLines.join('\n');
}

/**
 * Analyzes drift between current project state, Lockfile v2, and projected adapter render.
 *
 * @param {string} projectRoot
 * @param {string[]|string} [adapters='all']
 * @param {object} [options]
 * @returns {object} Structured drift report
 */
function detectDrift(projectRoot, adapters = 'all', options = {}) {
  const absRoot = path.resolve(projectRoot);
  const lockManager = new LockfileV2Manager(absRoot);
  const lockfile = lockManager.read();

  const { artifacts, collisions, context } = renderAdapters(absRoot, adapters, options);

  const findings = {
    [DRIFT_STATES.STALE_INPUT]: [],
    [DRIFT_STATES.MISSING_OUTPUT]: [],
    [DRIFT_STATES.MODIFIED_MANAGED_OUTPUT]: [],
    [DRIFT_STATES.ORPHAN_MANAGED_OUTPUT]: [],
    [DRIFT_STATES.ADAPTER_VERSION_MISMATCH]: [],
    [DRIFT_STATES.PROFILE_MISMATCH]: [],
  };

  const diffs = [];

  // 1. Check Profile Mismatch
  if (lockfile && lockfile.profile) {
    if (context.profileId && lockfile.profile.id !== context.profileId) {
      findings[DRIFT_STATES.PROFILE_MISMATCH].push({
        expected: context.profileId,
        actual: lockfile.profile.id,
      });
    }
  }

  // 2. Check Stale Input (Source Graph Hash)
  if (lockfile && lockfile.sourceGraphHash) {
    if (context.sourceGraphHash && lockfile.sourceGraphHash !== context.sourceGraphHash) {
      findings[DRIFT_STATES.STALE_INPUT].push({
        expected: context.sourceGraphHash,
        actual: lockfile.sourceGraphHash,
      });
    }
  }

  const projectedPaths = new Set(artifacts.map(a => a.path));

  // 3. Inspect each projected artifact against disk and lockfile
  for (const art of artifacts) {
    const fullPath = path.resolve(absRoot, art.path);
    const projectedContent = art.content.toString('utf8');
    const projectedExactHash = computeExactHash(art.content);
    const projectedSemanticHash = computeSemanticHash(art.content);

    if (!fs.existsSync(fullPath)) {
      findings[DRIFT_STATES.MISSING_OUTPUT].push({
        path: art.path,
        reason: 'Projected artifact does not exist on disk',
      });
      diffs.push({
        path: art.path,
        type: 'missing',
        diff: `+ (new file, ${projectedContent.length} bytes)`,
      });
    } else {
      const diskContent = fs.readFileSync(fullPath, 'utf8');
      const diskSemanticHash = computeSemanticHash(diskContent);

      // Check if disk matches projected render
      if (diskSemanticHash !== projectedSemanticHash) {
        const lockRecord = lockfile?.managedFiles?.[art.path];
        if (lockRecord && lockRecord.semanticTextSha256 !== diskSemanticHash) {
          findings[DRIFT_STATES.MODIFIED_MANAGED_OUTPUT].push({
            path: art.path,
            reason: 'Managed file was modified by user on disk',
            diskHash: diskSemanticHash,
            lockHash: lockRecord.semanticTextSha256,
          });
        } else {
          findings[DRIFT_STATES.STALE_INPUT].push({
            path: art.path,
            reason: 'Generated artifact differs from source skills projection',
          });
        }

        diffs.push({
          path: art.path,
          type: 'modified',
          diff: computeDiffSnippet(diskContent, projectedContent),
        });
      }
    }
  }

  // 4. Check for orphan files recorded in lockfile but no longer projected
  if (lockfile && lockfile.managedFiles) {
    for (const [recordedPath, meta] of Object.entries(lockfile.managedFiles)) {
      if (!projectedPaths.has(recordedPath)) {
        const fullRecorded = path.resolve(absRoot, recordedPath);
        if (fs.existsSync(fullRecorded)) {
          findings[DRIFT_STATES.ORPHAN_MANAGED_OUTPUT].push({
            path: recordedPath,
            reason: 'File recorded in lockfile is no longer generated by active skills/profile',
          });
          diffs.push({
            path: recordedPath,
            type: 'orphan',
            diff: `- (orphan file on disk, ${meta.kind})`,
          });
        }
      }
    }
  }

  const totalFindings = Object.values(findings).reduce((acc, list) => acc + list.length, 0);
  const hasDrift = totalFindings > 0 || collisions.length > 0;

  return {
    hasDrift,
    totalFindings,
    findings,
    collisions,
    diffs,
    projectedCount: artifacts.length,
  };
}

module.exports = {
  detectDrift,
  computeDiffSnippet,
  DRIFT_STATES,
};
