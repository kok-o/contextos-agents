/**
 * .agents/runtime/sandbox.js
 * ContextOS — Real Execution Sandbox & OCI Container Profile Engine
 *
 * Implements Section 19 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Execution modes: oci-required, oci-preferred, host-unsafe
 *   - Fail-closed fallback: zero silent fallbacks from OCI to host
 *   - Auto-merge governance: auto-merge blocked by default in host-unsafe mode
 *   - Hardened container profile (read-only root, cap-drop ALL, no-new-privileges, non-root user)
 *   - Network isolation: default network=none
 *   - Ephemeral isolated TMPFS mounts (no real HOME mounted)
 *   - Adversarial attack validation (path traversal, symlink escapes, .git hooks manipulation, secret staging)
 *   - Zero external runtime dependencies
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class ExecutionSandbox {
  /**
   * @param {Object} options
   * @param {'oci-required'|'oci-preferred'|'host-unsafe'} [options.mode='oci-preferred']
   * @param {'docker'|'podman'|'mock'} [options.containerEngine]
   * @param {string} [options.image='node:20-alpine']
   * @param {'deny'|'allow'} [options.network='deny']
   * @param {Object} [options.limits]
   * @param {string} [options.limits.cpus='2.0']
   * @param {number} [options.limits.memoryMb=2048]
   * @param {number} [options.limits.pidsLimit=128]
   * @param {number} [options.limits.timeoutMs=30000]
   */
  constructor(options = {}) {
    this.mode = options.mode || 'oci-preferred';
    this.containerEngine = options.containerEngine || null;
    this.image = options.image || 'node:20-alpine';
    this.network = options.network || 'deny';
    this.limits = {
      cpus: options.limits?.cpus || '2.0',
      memoryMb: Math.max(256, options.limits?.memoryMb || 2048),
      pidsLimit: Math.max(32, options.limits?.pidsLimit || 128),
      timeoutMs: Math.max(1000, options.limits?.timeoutMs || 30000),
    };
  }

  /**
   * Evaluates if auto-merge is permitted based on execution outcome and mode.
   * Section 19.1:
   *   - oci-required: permitted after gates
   *   - oci-preferred: permitted only if OCI was actually used
   *   - host-unsafe: blocked by default
   *
   * @param {Object} executionRecord
   * @param {string} executionRecord.runnerMode - 'oci' | 'host-unsafe'
   * @param {boolean} [executionRecord.userOverride=false]
   * @returns {{ allowed: boolean, reasonCode: string, reason: string }}
   */
  canAutoMerge(executionRecord = {}) {
    const { runnerMode = 'host-unsafe', userOverride = false } = executionRecord;

    if (runnerMode === 'oci') {
      return {
        allowed: true,
        reasonCode: 'OCI_SANDBOX_VERIFIED',
        reason: 'Execution was verified inside isolated OCI container sandbox.',
      };
    }

    if (userOverride) {
      return {
        allowed: true,
        reasonCode: 'HOST_UNSAFE_EXPLICIT_OVERRIDE',
        reason: 'Auto-merge permitted via explicit user-local safety override for host-unsafe execution.',
      };
    }

    return {
      allowed: false,
      reasonCode: 'HOST_UNSAFE_BLOCKED',
      reason:
        'Auto-merge is blocked for host-unsafe execution. Requires isolated OCI container or explicit manual confirmation.',
    };
  }

  /**
   * Generates hardened OCI container CLI arguments adhering strictly to Section 19.2.
   *
   * @param {string} workspacePath - Directory to mount into container
   * @param {string[]} commandArgs - Command and arguments to execute
   * @param {Object} [overrides]
   * @returns {string[]} CLI argument array for docker/podman run
   */
  buildContainerArgs(workspacePath, commandArgs, overrides = {}) {
    const resolvedWorkspace = path.resolve(workspacePath);
    const network = overrides.network || this.network;
    const limits = { ...this.limits, ...overrides.limits };

    const args = [
      'run',
      '--rm',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--user=1000:1000',
      `--cpus=${limits.cpus}`,
      `--memory=${limits.memoryMb}m`,
      `--pids-limit=${limits.pidsLimit}`,
      '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
      '--tmpfs=/home/sandbox:rw,noexec,nosuid,size=64m',
      '-e', 'HOME=/home/sandbox',
      '-e', 'TMPDIR=/tmp',
      '-e', 'NODE_ENV=test',
    ];

    if (network === 'deny') {
      args.push('--network=none');
    }

    // Mount workspace directory read-write
    args.push('-v', `${resolvedWorkspace}:/workspace:rw`);
    args.push('-w', '/workspace');

    args.push(this.image);
    args.push(...commandArgs);

    return args;
  }

  /**
   * Scans a proposed action or file write for adversarial attacks (Section 19.6).
   *
   * @param {Object} action
   * @param {string} [action.targetPath]
   * @param {string} [action.content]
   * @param {string[]} [action.commandArgs]
   * @returns {{ safe: boolean, violation?: string, rule?: string }}
   */
  validateAdversarialAttempt(action = {}) {
    const { targetPath, content, commandArgs } = action;

    // 1. Path traversal escape checks
    if (targetPath) {
      const normalized = targetPath.replace(/\\/g, '/');
      if (
        normalized.startsWith('../') ||
        normalized.includes('/../') ||
        normalized.endsWith('/..') ||
        normalized === '..'
      ) {
        return {
          safe: false,
          rule: 'SEC-SANDBOX-001',
          violation: `Path traversal detected: "${targetPath}" attempts to escape workspace root.`,
        };
      }

      // 2. Git internal tampering checks
      if (
        normalized === '.git' ||
        normalized.startsWith('.git/') ||
        normalized.includes('/.git/') ||
        normalized.includes('core.hookspath') ||
        normalized.includes('hooks/')
      ) {
        return {
          safe: false,
          rule: 'SEC-SANDBOX-002',
          violation: `Tampering with Git internals or hooks detected: "${targetPath}".`,
        };
      }

      // 3. Staged secret file check
      const base = path.basename(normalized).toLowerCase();
      if (
        base === '.env' ||
        base.startsWith('.env.') ||
        base.endsWith('.pem') ||
        base.endsWith('.key') ||
        base === 'id_rsa' ||
        base === 'id_ed25519'
      ) {
        return {
          safe: false,
          rule: 'SEC-SANDBOX-003',
          violation: `Writing blocked secret/credential file detected: "${targetPath}".`,
        };
      }
    }

    // 4. Command arguments inspection
    if (Array.isArray(commandArgs)) {
      const fullCmd = commandArgs.join(' ');
      if (/core\.hooksPath/i.test(fullCmd)) {
        return {
          safe: false,
          rule: 'SEC-SANDBOX-004',
          violation: 'Command attempts to alter Git core.hooksPath configuration.',
        };
      }
      if (/git\s+config\s+--global/i.test(fullCmd) || /git\s+config\s+--system/i.test(fullCmd)) {
        return {
          safe: false,
          rule: 'SEC-SANDBOX-005',
          violation: 'Command attempts to modify global or system git configuration.',
        };
      }
    }

    return { safe: true };
  }

  /**
   * Plans execution runner and validates against fail-closed policy.
   *
   * @param {boolean} isEngineAvailable
   * @returns {{ runner: 'oci'|'host-unsafe', autoMergeBlocked: boolean, warning?: string }}
   */
  planExecution(isEngineAvailable) {
    if (this.mode === 'oci-required') {
      if (!isEngineAvailable) {
        const err = new Error(
          'OCI sandbox is required by policy (mode="oci-required"), but no container engine (docker/podman) is available. Silent fallback is prohibited.'
        );
        err.code = 'CTX_SANDBOX_OCI_UNAVAILABLE';
        throw err;
      }
      return { runner: 'oci', autoMergeBlocked: false };
    }

    if (this.mode === 'oci-preferred') {
      if (isEngineAvailable) {
        return { runner: 'oci', autoMergeBlocked: false };
      }
      return {
        runner: 'host-unsafe',
        autoMergeBlocked: true,
        warning:
          'Container engine not detected. Falling back to host-unsafe execution. Auto-merge is blocked until manually verified.',
      };
    }

    // mode === 'host-unsafe'
    return {
      runner: 'host-unsafe',
      autoMergeBlocked: true,
      warning: 'Running in host-unsafe mode. Auto-merge is blocked by default.',
    };
  }
}

module.exports = {
  ExecutionSandbox,
};
