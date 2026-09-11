/**
 * tests/sandbox-execution.test.js
 * ContextOS — Real Execution Sandbox Test Suite
 *
 * Verifies Milestone 14 (Issue #18):
 *   - Hardened container profile argument builder (Section 19.2)
 *   - Fail-closed fallback: rejects silent fallback when oci-required
 *   - Auto-merge blocked in host-unsafe mode without explicit user override
 *   - Adversarial attack detection (path traversal, git hooks, credentials, config tampering)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ExecutionSandbox } = require('../contextos-mcp/src/runtime/sandbox.cjs');

test('ExecutionSandbox — hardened container profile arguments generation', () => {
  const sandbox = new ExecutionSandbox({
    image: 'node:20-alpine',
    network: 'deny',
    limits: { cpus: '1.5', memoryMb: 1024, pidsLimit: 64 },
  });

  const workspace = path.resolve('temp-workspace');
  const args = sandbox.buildContainerArgs(workspace, ['npm', 'test']);

  assert.ok(args.includes('--read-only'), 'Must include --read-only');
  assert.ok(args.includes('--cap-drop=ALL'), 'Must include --cap-drop=ALL');
  assert.ok(args.includes('--security-opt=no-new-privileges'), 'Must include --security-opt=no-new-privileges');
  assert.ok(args.includes('--user=1000:1000'), 'Must run as non-root user');
  assert.ok(args.includes('--network=none'), 'Must isolate network');
  assert.ok(args.includes('--cpus=1.5'));
  assert.ok(args.includes('--memory=1024m'));
  assert.ok(args.includes('--pids-limit=64'));
  assert.ok(args.includes('node:20-alpine'));
  assert.equal(args[args.length - 2], 'npm');
  assert.equal(args[args.length - 1], 'test');
});

test('ExecutionSandbox — fail-closed policy when oci-required and engine unavailable', () => {
  const sandbox = new ExecutionSandbox({ mode: 'oci-required' });

  assert.throws(
    () => {
      sandbox.planExecution(false);
    },
    { code: 'CTX_SANDBOX_OCI_UNAVAILABLE' },
    'Must fail-closed with CTX_SANDBOX_OCI_UNAVAILABLE when engine is missing in oci-required mode'
  );

  const planWithEngine = sandbox.planExecution(true);
  assert.equal(planWithEngine.runner, 'oci');
  assert.equal(planWithEngine.autoMergeBlocked, false);
});

test('ExecutionSandbox — oci-preferred falls back with auto-merge blocked', () => {
  const sandbox = new ExecutionSandbox({ mode: 'oci-preferred' });

  const plan = sandbox.planExecution(false);
  assert.equal(plan.runner, 'host-unsafe');
  assert.equal(plan.autoMergeBlocked, true);
  assert.ok(plan.warning.includes('Auto-merge is blocked'));
});

test('ExecutionSandbox — auto-merge gating across modes and overrides', () => {
  const sandbox = new ExecutionSandbox();

  // 1. OCI run: auto-merge allowed
  const ociCheck = sandbox.canAutoMerge({ runnerMode: 'oci' });
  assert.equal(ociCheck.allowed, true);
  assert.equal(ociCheck.reasonCode, 'OCI_SANDBOX_VERIFIED');

  // 2. Host-unsafe run without override: auto-merge blocked
  const hostUnsafeBlocked = sandbox.canAutoMerge({ runnerMode: 'host-unsafe' });
  assert.equal(hostUnsafeBlocked.allowed, false);
  assert.equal(hostUnsafeBlocked.reasonCode, 'HOST_UNSAFE_BLOCKED');

  // 3. Host-unsafe run with user override: auto-merge allowed
  const hostUnsafeOverride = sandbox.canAutoMerge({ runnerMode: 'host-unsafe', userOverride: true });
  assert.equal(hostUnsafeOverride.allowed, true);
  assert.equal(hostUnsafeOverride.reasonCode, 'HOST_UNSAFE_EXPLICIT_OVERRIDE');
});

test('ExecutionSandbox — adversarial attack validation catches malicious actions', () => {
  const sandbox = new ExecutionSandbox();

  // Traversal attack
  const traversal = sandbox.validateAdversarialAttempt({ targetPath: '../../etc/shadow' });
  assert.equal(traversal.safe, false);
  assert.equal(traversal.rule, 'SEC-SANDBOX-001');

  // Git hooks tampering
  const gitHook = sandbox.validateAdversarialAttempt({ targetPath: '.git/hooks/post-checkout' });
  assert.equal(gitHook.safe, false);
  assert.equal(gitHook.rule, 'SEC-SANDBOX-002');

  // Secret staging attempt
  const secretWrite = sandbox.validateAdversarialAttempt({ targetPath: 'src/.env.production' });
  assert.equal(secretWrite.safe, false);
  assert.equal(secretWrite.rule, 'SEC-SANDBOX-003');

  // Command tampering with git core.hooksPath
  const hookCmd = sandbox.validateAdversarialAttempt({ commandArgs: ['git', 'config', 'core.hooksPath', '/tmp/h'] });
  assert.equal(hookCmd.safe, false);
  assert.equal(hookCmd.rule, 'SEC-SANDBOX-004');

  // Command tampering with git global config
  const globalCmd = sandbox.validateAdversarialAttempt({ commandArgs: ['git', 'config', '--global', 'alias.co', 'checkout'] });
  assert.equal(globalCmd.safe, false);
  assert.equal(globalCmd.rule, 'SEC-SANDBOX-005');

  // Safe file modification
  const safeAction = sandbox.validateAdversarialAttempt({
    targetPath: 'src/components/Button.tsx',
    commandArgs: ['npm', 'test'],
  });
  assert.equal(safeAction.safe, true);
});

test('ExecutionSandbox — execute API runs mock container and records runner evidence (W5.3)', async () => {
  const sandbox = new ExecutionSandbox({
    mode: 'oci-required',
    containerEngine: 'mock',
    image: 'node:20-alpine',
    network: 'deny',
  });

  const workspace = path.resolve('.');
  const res = await sandbox.execute(workspace, ['npm', 'test']);

  assert.equal(res.success, true);
  assert.equal(res.runnerMode, 'oci');
  assert.equal(res.containerEngine, 'mock');
  assert.equal(res.autoMergeBlocked, false);
  assert.ok(res.outputSha256, 'Must compute outputSha256');
  assert.equal(res.evidence.runnerMode, 'oci');
  assert.equal(res.evidence.network, 'deny');
  assert.ok(res.evidence.imageDigest.startsWith('sha256:'));
});

test('ExecutionSandbox — image digest mismatch throws CTX_SANDBOX_DIGEST_MISMATCH fail-closed (W5.3)', async () => {
  const sandbox = new ExecutionSandbox({
    mode: 'oci-required',
    containerEngine: 'mock',
    image: 'node:20-alpine',
    expectedImageDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });

  await assert.rejects(
    async () => {
      await sandbox.execute(path.resolve('.'), ['npm', 'test']);
    },
    { code: 'CTX_SANDBOX_DIGEST_MISMATCH' },
    'Must fail-closed with CTX_SANDBOX_DIGEST_MISMATCH when digest does not match expected'
  );
});

test('ExecutionSandbox — repository config cannot authorize host-unsafe auto-merge override (W5.4)', () => {
  const sandbox = new ExecutionSandbox({ mode: 'oci-preferred' });

  // When override comes from repo config, it is rejected
  const repoOverride = sandbox.canAutoMerge({
    runnerMode: 'host-unsafe',
    userOverride: true,
    isFromRepoConfig: true,
  });

  assert.equal(repoOverride.allowed, false);
  assert.equal(repoOverride.reasonCode, 'REPO_CONFIG_OVERRIDE_PROHIBITED');

  // When override is genuinely user-local, it is accepted
  const userOverride = sandbox.canAutoMerge({
    runnerMode: 'host-unsafe',
    userOverride: true,
    isFromRepoConfig: false,
  });

  assert.equal(userOverride.allowed, true);
  assert.equal(userOverride.reasonCode, 'HOST_UNSAFE_EXPLICIT_OVERRIDE');
});

test('ExecutionSandbox — host fallback execution blocks auto-merge by default (W5.4)', async () => {
  const sandbox = new ExecutionSandbox({
    mode: 'host-unsafe',
  });

  const res = await sandbox.execute(path.resolve('.'), ['node', '--version']);
  assert.equal(res.runnerMode, 'host-unsafe');
  assert.equal(res.autoMergeBlocked, true);
  assert.equal(res.evidence.runnerMode, 'host-unsafe');
});

test('ExecutionSandbox — adversarial execution attempt throws security exception before spawning', async () => {
  const sandbox = new ExecutionSandbox({
    mode: 'oci-preferred',
  });

  await assert.rejects(
    async () => {
      await sandbox.execute(path.resolve('.'), ['git', 'config', 'core.hooksPath', '/tmp/malicious']);
    },
    { code: 'SEC-SANDBOX-004' }
  );
});

