/**
 * .agents/runtime/verification-pipeline.js
 * ContextOS — Secure Verification Pipeline & Immutable Candidate Execution
 *
 * Implements Section 16 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Structured VerificationSpec parsing and command trust enforcement
 *   - Host-mode restrictions (bans npx, enforces argv array)
 *   - Cross-platform bounded process tree termination (Windows taskkill, Unix process groups)
 *   - Ephemeral minimal environment and sensitive token redaction
 *   - Immutable candidate validation (detects post-test candidate mutation and dirty trees)
 *   - Generates machine-verifiable VerificationAttestation with SHA-256 output digest
 */

'use strict';

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const {
  sha256,
  createVerificationAttestation,
} = require('./attestations.js');

const TRUSTED_TOOLS = new Set(['npm', 'pnpm', 'yarn', 'pytest', 'cargo', 'go']);
const FORBIDDEN_EVAL_ARGS = new Set(['-e', '-c', '--eval', '--print', '-p', '--input-type']);

const SANITIZED_ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
  'NODE_ENV',
  'LANG',
  'LC_ALL',
  'CI',
]);

/**
 * Parses a string command or object into a canonical VerificationSpec.
 *
 * @param {string|Object} input
 * @returns {Object} VerificationSpec
 */
function parseVerificationSpec(input) {
  if (!input) {
    throw new Error('Verification specification cannot be empty');
  }

  if (typeof input === 'object' && input.executable && Array.isArray(input.args)) {
    return {
      executable: input.executable,
      args: input.args,
      timeoutMs: input.timeoutMs || 60000,
      required: input.required !== false,
      network: input.network || 'deny',
      allowedOutputPaths: input.allowedOutputPaths || [],
    };
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Verification command cannot be empty string');
    }

    // Ban shell metacharacters and chaining
    if (/[&|;`$><%]/.test(trimmed)) {
      const err = new Error('Security error: Shell metacharacters and command chaining are prohibited in verification commands');
      err.code = 'CTX_COMMAND_CHAINING_PROHIBITED';
      throw err;
    }

    const parts = trimmed.split(/\s+/);
    const rawExe = parts[0].toLowerCase().replace(/\.(cmd|bat|exe)$/i, '');
    const args = parts.slice(1);

    return {
      executable: rawExe,
      args,
      timeoutMs: 60000,
      required: true,
      network: 'deny',
      isLegacyString: true,
    };
  }

  throw new Error('Invalid verification specification format: expected VerificationSpec object or command string');
}

/**
 * Enforces command trust policy.
 *
 * @param {Object} spec - VerificationSpec
 * @param {Object} [options] - { runnerMode, trusted }
 */
function validateCommandTrust(spec, options = {}) {
  const runnerMode = options.runnerMode || 'host-unsafe';

  // Rule 1: npx is forbidden in host mode (Section 16.2: "npx запрещён в host mode")
  if (spec.executable === 'npx' && runnerMode === 'host-unsafe') {
    const err = new Error('Security error: "npx" execution is strictly forbidden in host mode. Use OCI sandbox or local package runner.');
    err.code = 'CTX_COMMAND_UNTRUSTED';
    throw err;
  }

  // Rule 2: Unlisted tools require OCI runner or explicit local trust
  if (!TRUSTED_TOOLS.has(spec.executable)) {
    if (runnerMode === 'host-unsafe' && !options.trusted) {
      const err = new Error(
        `Security error: Command "${spec.executable}" is not in the trusted tools whitelist (${Array.from(TRUSTED_TOOLS).join(', ')}). Arbitrary commands require OCI sandbox or explicit user trust.`
      );
      err.code = 'CTX_COMMAND_UNTRUSTED';
      throw err;
    }
  }

  // Rule 3: Inline evaluation arguments prohibited
  for (const arg of spec.args) {
    if (FORBIDDEN_EVAL_ARGS.has(arg.toLowerCase())) {
      const err = new Error(`Security error: Inline code evaluation argument "${arg}" is prohibited in verification spec.`);
      err.code = 'CTX_FORBIDDEN_ARGUMENT';
      throw err;
    }
  }
}

/**
 * Builds a sanitized, minimal environment stripped of secrets and tokens.
 */
function getSanitizedEnvironment(customEnv = {}) {
  const env = {
    CI: 'true',
    NODE_ENV: 'test',
  };

  for (const key of SANITIZED_ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  // Merge any explicitly permitted custom env variables
  for (const [k, v] of Object.entries(customEnv)) {
    // Prevent accidental leak of token/secret/password variables
    if (!/TOKEN|SECRET|KEY|PASSWORD|AUTH|CREDENTIAL/i.test(k)) {
      env[k] = v;
    }
  }

  return env;
}

/**
 * Redacts API keys, bearer tokens, and secret strings from output preview.
 */
function redactSensitiveOutput(text = '') {
  if (!text) return '';
  return text
    // Secret tokens and API keys
    .replace(/(?:sk-[a-zA-Z0-9]{20,}|gh[pousr]-[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35})/g, '[REDACTED_API_KEY]')
    // Bearer / Authorization headers
    .replace(/(?:Authorization:\s*)?(Bearer\s+)[^\s\n]+/gi, '$1[REDACTED_TOKEN]')
    // Password fields
    .replace(/(password[\s:=]+)[^\s\n&]+/gi, '$1[REDACTED_PASSWORD]')
    // Generic high-entropy hex/base64 tokens (40+ chars)
    .replace(/(["']?[a-zA-Z0-9_-]*(?:token|secret|password|key)["']?\s*[:=]\s*["']?)[a-zA-Z0-9_.+/=-]{32,}(["']?)/gi, '$1[REDACTED]$2');
}

/**
 * Bounded, cross-platform process tree killer (Section 16.4).
 * Kills children and grandchildren upon timeout or cancellation.
 */
function killProcessTree(pid) {
  if (!pid) return;

  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // Process might have already exited
    }
  } else {
    try {
      // Kill entire process group
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already exited
      }
    }
  }
}

/**
 * Checks that the working tree and candidate commit remained immutable (Section 16.3).
 *
 * @param {string} worktreePath
 * @param {string} expectedHeadSha
 * @returns {{ clean: boolean, mutatedHead?: boolean, dirtyFiles?: string[] }}
 */
function verifyCandidateImmutability(worktreePath, expectedHeadSha) {
  try {
    const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();

    if (expectedHeadSha && currentHead !== expectedHeadSha) {
      return { clean: false, mutatedHead: true };
    }

    const statusOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();

    if (statusOutput.length > 0) {
      const dirtyFiles = statusOutput.split('\n').map(l => l.trim().slice(3));
      return { clean: false, mutatedHead: false, dirtyFiles };
    }

    return { clean: true };
  } catch {
    // If not a git worktree or command fails, treat as non-violating for plain test dirs
    return { clean: true };
  }
}

/**
 * Executes a verification run in a worktree and generates a VerificationAttestation.
 *
 * @param {string} worktreePath
 * @param {Object|string} specInput
 * @param {Object} subjectInfo - { repositoryFingerprint, baseSha, headSha, diffSha256, scopeSha256 }
 * @param {Object} [options] - { runnerMode, trusted }
 * @returns {Promise<Object>} VerificationAttestation
 */
async function executeVerification(worktreePath, specInput, subjectInfo = {}, options = {}) {
  const startedAt = Date.now();
  const spec = parseVerificationSpec(specInput);
  const runnerMode = options.runnerMode || 'host-unsafe';

  // 1. Validate Command Trust Policy
  validateCommandTrust(spec, { runnerMode, trusted: options.trusted });

  // 2. Pre-Verification Immutability Snapshot
  const preCheck = verifyCandidateImmutability(worktreePath, subjectInfo.headSha);
  if (!preCheck.clean && preCheck.mutatedHead) {
    throw new Error('Cannot execute verification: worktree HEAD does not match subject headSha');
  }

  // 3. Spawn verification subprocess
  const hasShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(spec.executable);

  return new Promise((resolve) => {
    let child;
    let timedOut = false;
    let stdoutData = '';
    let stderrData = '';
    const hash = crypto.createHash('sha256');

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      if (child && child.pid) {
        killProcessTree(child.pid);
      }
    }, spec.timeoutMs);

    try {
      child = spawn(spec.executable, spec.args, {
        cwd: worktreePath,
        env: getSanitizedEnvironment(options.env),
        shell: hasShell,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (spawnErr) {
      clearTimeout(timeoutTimer);
      const completedAt = Date.now();
      return resolve(createVerificationAttestation({
        status: 'ERROR',
        subject: subjectInfo,
        command: { executable: spec.executable, args: spec.args, cwd: worktreePath, timeoutMs: spec.timeoutMs },
        runnerMode,
        startedAt,
        completedAt,
        reasonCode: 'SPAWN_FAILED',
        evidence: {
          exitCode: 127,
          outputSha256: sha256(spawnErr.message),
          redactedPreview: spawnErr.message,
        },
      }));
    }

    child.stdout?.on('data', (chunk) => {
      hash.update(chunk);
      if (stdoutData.length < 50000) {
        stdoutData += chunk.toString();
      }
    });

    child.stderr?.on('data', (chunk) => {
      hash.update(chunk);
      if (stderrData.length < 50000) {
        stderrData += chunk.toString();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      const completedAt = Date.now();
      resolve(createVerificationAttestation({
        status: 'ERROR',
        subject: subjectInfo,
        command: { executable: spec.executable, args: spec.args, cwd: worktreePath, timeoutMs: spec.timeoutMs },
        runnerMode,
        startedAt,
        completedAt,
        reasonCode: err.code === 'ENOENT' ? 'SPAWN_FAILED' : 'EXECUTION_ERROR',
        evidence: {
          exitCode: 1,
          outputSha256: sha256(err.message),
          redactedPreview: err.message,
        },
      }));
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeoutTimer);
      const completedAt = Date.now();
      const outputSha256 = hash.digest('hex');
      const combinedOutput = `${stdoutData}\n${stderrData}`.trim();
      const redactedPreview = redactSensitiveOutput(combinedOutput.slice(0, 2000));

      // Check timeout
      if (timedOut) {
        return resolve(createVerificationAttestation({
          status: 'TIMEOUT',
          subject: subjectInfo,
          command: { executable: spec.executable, args: spec.args, cwd: worktreePath, timeoutMs: spec.timeoutMs },
          runnerMode,
          startedAt,
          completedAt,
          reasonCode: 'EXECUTION_TIMED_OUT',
          evidence: {
            exitCode: null,
            signal: 'SIGKILL',
            outputSha256,
            redactedPreview: `${redactedPreview}\n[VERIFICATION_TIMEOUT after ${spec.timeoutMs}ms]`,
          },
        }));
      }

      // 4. Post-Verification Immutability Check (Section 16.3)
      const postCheck = verifyCandidateImmutability(worktreePath, subjectInfo.headSha);
      if (!postCheck.clean) {
        // Test script modified HEAD or left dirty files -> invalidates verification
        return resolve(createVerificationAttestation({
          status: 'FAIL',
          subject: subjectInfo,
          command: { executable: spec.executable, args: spec.args, cwd: worktreePath, timeoutMs: spec.timeoutMs },
          runnerMode,
          startedAt,
          completedAt,
          reasonCode: postCheck.mutatedHead ? 'TEST_MUTATED_HEAD' : 'TEST_DIRTY_WORKTREE',
          evidence: {
            exitCode: 1,
            outputSha256,
            redactedPreview: `Verification failed: test script modified worktree state (${(postCheck.dirtyFiles || []).join(', ')})`,
          },
        }));
      }

      // 5. Normal Outcome
      const isSuccess = exitCode === 0;
      resolve(createVerificationAttestation({
        status: isSuccess ? 'PASS' : 'FAIL',
        subject: subjectInfo,
        command: { executable: spec.executable, args: spec.args, cwd: worktreePath, timeoutMs: spec.timeoutMs },
        runnerMode,
        startedAt,
        completedAt,
        evidence: {
          exitCode: exitCode ?? (isSuccess ? 0 : 1),
          signal: signal || null,
          outputSha256,
          redactedPreview,
        },
      }));
    });
  });
}

module.exports = {
  TRUSTED_TOOLS,
  parseVerificationSpec,
  validateCommandTrust,
  getSanitizedEnvironment,
  redactSensitiveOutput,
  killProcessTree,
  verifyCandidateImmutability,
  executeVerification,
};
