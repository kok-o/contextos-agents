/**
 * .agents/runtime/transactional-git.cjs
 * ContextOS — Transactional Git Worktree Merge Pipeline
 *
 * Implements Section 18 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Mutual exclusion via repository LeaseLock
 *   - Fixes target base SHA before applying candidate commits
 *   - Isolated integration worktree (ctx-int-<timestamp>-<id>) in temporary directory
 *   - All-or-nothing candidate application: aborts whole transaction on conflict
 *   - Combined attestation & verification check
 *   - Stale base detection: rejects merge if target advanced during verification
 *   - Explicit finalization gate with dirty primary checkout protection
 *   - Safe cleanup: never deletes active or foreign user branches
 *   - Zero external dependencies (pure Node child_process & fs)
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { LeaseLock } = require('../../../.agents/transaction-core/ipc-lock.js');

function execGit(args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024, env }, (err, stdout, stderr) => {
      if (err) {
        const error = new Error(`git ${args[0]} failed: ${stderr || err.message}`);
        error.code = err.code || 'CTX_GIT_COMMAND_FAILED';
        error.stderr = stderr ? stderr.toString() : '';
        error.stdout = stdout ? stdout.toString() : '';
        error.args = args;
        reject(error);
      } else {
        resolve({ stdout: stdout ? stdout.toString().trim() : '', stderr: stderr ? stderr.toString().trim() : '' });
      }
    });
  });
}

class TransactionalGitPipeline {
  /**
   * @param {Object} options
   * @param {string} options.repoRoot - Absolute path to repository root
   * @param {string} [options.lockFilePath] - Custom path to lockfile
   * @param {number} [options.leaseTtlMs=30000] - Lease duration in ms
   */
  constructor(options = {}) {
    if (!options.repoRoot) {
      throw new Error('TransactionalGitPipeline requires repoRoot');
    }

    this.repoRoot = path.resolve(options.repoRoot);
    const lockDir = path.join(this.repoRoot, '.agents', '.contextos', 'state');
    this.lockFilePath = options.lockFilePath || path.join(lockDir, 'git-operation.lock');
    this.leaseTtlMs = options.leaseTtlMs || 30000;

    this.lock = new LeaseLock({
      lockFilePath: this.lockFilePath,
      ttlMs: this.leaseTtlMs,
      heartbeatIntervalMs: Math.max(1000, Math.floor(this.leaseTtlMs / 3)),
    });
  }

  /**
   * Resolves a reference or symbol to a 40-character SHA.
   *
   * @param {string} ref
   * @param {string} [cwd]
   * @returns {Promise<string>}
   */
  async resolveRef(ref, cwd = this.repoRoot) {
    const { stdout } = await execGit(['rev-parse', '--verify', `${ref}^{commit}`], cwd);
    return stdout;
  }

  /**
   * Checks if the working tree has uncommitted staged or unstaged changes.
   * Internal ContextOS runtime state directories are excluded from dirty checks.
   *
   * @param {string} [cwd]
   * @returns {Promise<boolean>} True if working tree is dirty
   */
  async isWorkingTreeDirty(cwd = this.repoRoot) {
    const { stdout } = await execGit(['status', '--porcelain'], cwd);
    const lines = stdout.split(/\r?\n/).filter((line) => {
      if (!line.trim()) return false;
      const file = line.slice(3).trim();
      if (
        file === '.agents' ||
        file === '.agents/' ||
        file.startsWith('.agents/') ||
        file.startsWith('.agents\\')
      ) {
        return false;
      }
      return true;
    });
    return lines.length > 0;
  }

  /**
   * Executes a transactional integration and merge.
   *
   * @param {Object} params
   * @param {string} params.targetRef - Target branch to merge into (e.g. 'main', 'develop')
   * @param {string[]} params.candidateCommits - Ordered array of commit SHAs or branch refs
   * @param {Object} [params.attestations] - Optional map of commitSha -> { status: 'PASS' }
   * @param {boolean} [params.finalize=false] - If true, merges into target branch; if false, prepares integration branch
   * @param {'fast-forward'|'squash'} [params.mode='fast-forward'] - Merge finalization strategy
   * @param {string} [params.squashCommitMessage] - Required if mode is 'squash'
   * @returns {Promise<Object>} Merge transaction outcome
   */
  async executeMerge(params = {}) {
    const {
      targetRef = 'main',
      candidateCommits = [],
      attestations = null,
      finalize = false,
      mode = 'fast-forward',
      squashCommitMessage = 'feat(ctx): merge candidate integration batch',
    } = params;

    if (!Array.isArray(candidateCommits) || candidateCommits.length === 0) {
      throw new Error('executeMerge requires non-empty candidateCommits array');
    }

    // 1. Pre-merge Attestation Verification (fail fast before acquiring resources)
    if (attestations) {
      for (const commitRef of candidateCommits) {
        const sha = await this.resolveRef(commitRef);
        const attestation = attestations[sha] || attestations[commitRef];
        if (!attestation || attestation.status !== 'PASS') {
          const err = new Error(
            `Candidate commit ${commitRef} (${sha}) lacks evidence-bearing PASS attestation. Merge blocked.`
          );
          err.code = 'CTX_ATTESTATION_UNVERIFIED';
          err.commitSha = sha;
          throw err;
        }
      }
    }

    // 2. Acquire exclusive repository operation lease
    await this.lock.acquire({ timeoutMs: 15000 });

    let integrationBranch = null;
    let worktreeDir = null;
    let baseSha = null;

    try {
      // 3. Fix target base SHA
      baseSha = await this.resolveRef(targetRef);

      // If finalization is requested, verify primary working tree is clean
      if (finalize) {
        const dirty = await this.isWorkingTreeDirty(this.repoRoot);
        if (dirty) {
          const err = new Error(
            `Primary working tree is dirty. Cannot finalize merge into target "${targetRef}" without clean checkout.`
          );
          err.code = 'CTX_GIT_DIRTY_CHECKOUT';
          throw err;
        }
      }

      // 4. Create isolated integration worktree off target base SHA
      const runId = crypto.randomBytes(4).toString('hex');
      integrationBranch = `ctx-int-${Date.now()}-${runId}`;
      worktreeDir = path.join(os.tmpdir(), `ctx-worktree-${runId}`);

      await execGit(['worktree', 'add', '-b', integrationBranch, worktreeDir, baseSha], this.repoRoot);

      // 5. Apply candidate commits inside isolated worktree
      let appliedCount = 0;
      for (const commitRef of candidateCommits) {
        const sha = await this.resolveRef(commitRef);

        try {
          await execGit(['cherry-pick', sha], worktreeDir);
          appliedCount++;
        } catch (pickErr) {
          // Conflict detected! Abort cherry-pick and clean up entire integration worktree
          try {
            await execGit(['cherry-pick', '--abort'], worktreeDir);
          } catch {}

          await this._removeWorktreeAndBranch(worktreeDir, integrationBranch);
          worktreeDir = null;
          integrationBranch = null;

          const err = new Error(
            `Merge conflict while applying candidate commit ${commitRef} (index ${appliedCount}). Entire integration transaction aborted.`
          );
          err.code = 'CTX_GIT_MERGE_CONFLICT';
          err.failedCommit = sha;
          err.appliedCount = appliedCount;
          err.details = pickErr.stderr || pickErr.message;
          throw err;
        }
      }

      // 6. Get resulting integration head SHA
      const integrationHeadSha = await this.resolveRef(integrationBranch);

      // 7. Check for target advance (stale base check)
      const currentTargetSha = await this.resolveRef(targetRef);
      if (currentTargetSha !== baseSha) {
        await this._removeWorktreeAndBranch(worktreeDir, integrationBranch);
        worktreeDir = null;
        integrationBranch = null;

        const err = new Error(
          `Target branch "${targetRef}" advanced concurrently from ${baseSha} to ${currentTargetSha}. Aborting transaction.`
        );
        err.code = 'CTX_GIT_STALE_BASE';
        err.initialBase = baseSha;
        err.currentBase = currentTargetSha;
        throw err;
      }

      // 8. If finalize is not requested, return integration branch ready for combined verification
      if (!finalize) {
        // Remove worktree folder but keep integrationBranch in git
        try {
          await execGit(['worktree', 'remove', '--force', worktreeDir], this.repoRoot);
          worktreeDir = null;
        } catch {}

        return {
          status: 'READY_FOR_FINALIZATION',
          targetRef,
          baseSha,
          integrationBranch,
          integrationHeadSha,
          appliedCommits: candidateCommits.length,
        };
      }

      // 9. Explicit finalization: merge integration branch into targetRef in primary repo
      // First remove the temporary worktree so git doesn't hold locks
      await execGit(['worktree', 'remove', '--force', worktreeDir], this.repoRoot);
      worktreeDir = null;

      if (mode === 'squash') {
        await execGit(['merge', '--squash', integrationBranch], this.repoRoot);
        await execGit(['commit', '-m', squashCommitMessage], this.repoRoot);
      } else {
        await execGit(['merge', '--ff-only', integrationBranch], this.repoRoot);
      }

      const finalSha = await this.resolveRef(targetRef);

      // Safe cleanup of temporary integration branch
      await this.safeCleanup(integrationBranch);
      integrationBranch = null;

      return {
        status: 'MERGED',
        targetRef,
        baseSha,
        finalSha,
        mode,
        appliedCommits: candidateCommits.length,
      };
    } finally {
      // Guaranteed cleanup on exception or exit
      if (worktreeDir) {
        try {
          await execGit(['worktree', 'remove', '--force', worktreeDir], this.repoRoot);
        } catch {}
      }
      if (integrationBranch && finalize) {
        try {
          await this.safeCleanup(integrationBranch);
        } catch {}
      }
      this.lock.release();
    }
  }

  async _removeWorktreeAndBranch(worktreeDir, branchName) {
    if (worktreeDir) {
      try {
        await execGit(['worktree', 'remove', '--force', worktreeDir], this.repoRoot);
      } catch {}
    }
    if (branchName) {
      try {
        await this.safeCleanup(branchName);
      } catch {}
    }
  }

  /**
   * Safely deletes a temporary integration branch.
   * Enforces strict safety: only branches with prefix "ctx-int-" can be deleted.
   *
   * @param {string} branchName
   */
  async safeCleanup(branchName) {
    if (!branchName || !branchName.startsWith('ctx-int-')) {
      throw new Error(`Unsafe branch cleanup blocked: branch "${branchName}" is not a temporary integration branch.`);
    }

    try {
      await execGit(['branch', '-D', branchName], this.repoRoot);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = {
  TransactionalGitPipeline,
  execGit,
};
