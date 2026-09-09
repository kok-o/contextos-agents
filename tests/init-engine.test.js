/**
 * tests/init-engine.test.js
 * Unit tests for Milestone 8 Init State Machine Engine (.agents/init/init-engine.js)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  discover,
  planInit,
  validateStagedFiles,
  executeInit,
} = require('../.agents/init/init-engine.js');
const { LockfileV2Manager } = require('../.agents/filesystem/lockfile-v2.js');

describe('Milestone 8 — Init State Machine Engine', () => {
  let tmpDir;
  let distDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-init-test-'));
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-dist-test-'));

    // Populate mock distribution .agents directory
    fs.mkdirSync(path.join(distDir, 'core', 'skills', 'react'), { recursive: true });
    fs.mkdirSync(path.join(distDir, 'core', 'skills', 'engineering-workflow'), { recursive: true });
    fs.writeFileSync(
      path.join(distDir, 'core', 'skills', 'react', 'SKILL.md'),
      '---\nname: react\ndescription: React guidelines\n---\n# React\n'
    );
    fs.writeFileSync(
      path.join(distDir, 'core', 'skills', 'engineering-workflow', 'SKILL.md'),
      '---\nname: engineering-workflow\ndescription: Workflow spec\n---\n# Engineering Workflow\n'
    );
    fs.writeFileSync(path.join(distDir, 'AGENTS.md'), '# Project Operating System Rules\n');

    // Create minimal project in tmpDir
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-project', dependencies: { react: '^18.2.0' } })
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(distDir, { recursive: true, force: true });
    } catch {}
  });

  test('discover() extracts workspace packages, detected stack, and recommended profile', () => {
    const disc = discover(tmpDir);

    assert.equal(disc.packagesCount, 1);
    assert.ok(disc.detectedStack.includes('React'));
    assert.equal(disc.recommendedProfile, 'frontend');
    assert.ok(disc.confidence > 0.8);
    assert.ok(Array.isArray(disc.adapters));
  });

  test('planInit() creates a deterministic plan without modifying target disk', () => {
    const plan = planInit(tmpDir, distDir);

    assert.deepEqual(plan.stages, ['DISCOVER', 'PLAN', 'STAGE', 'VALIDATE', 'COMMIT', 'REPORT']);
    assert.equal(plan.summary.create, 3);
    assert.equal(plan.summary.update, 0);
    assert.equal(plan.summary.conflicts, 0);
    assert.ok(plan.summary.estimatedFootprintBytes > 0);

    // Verify nothing written to target project
    assert.equal(fs.existsSync(path.join(tmpDir, '.agents')), false);
  });

  test('executeInit({ dryRun: true }) outputs report with zero disk modifications', () => {
    const res = executeInit(tmpDir, distDir, { dryRun: true });

    assert.equal(res.success, true);
    assert.equal(res.dryRun, true);
    assert.ok(res.report.includes('Detected profile: frontend'));
    assert.ok(res.report.includes('Create: 3'));
    assert.equal(fs.existsSync(path.join(tmpDir, '.agents')), false, 'Dry run must not create files on disk');
  });

  test('executeInit() commits files atomically and writes Lockfile v2', () => {
    const res = executeInit(tmpDir, distDir);

    assert.equal(res.success, true);
    assert.ok(res.txId.startsWith('tx-'), 'Transaction ID must be returned');

    // Verify files on disk
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'core', 'skills', 'react', 'SKILL.md')));

    // Verify Lockfile v2
    const lockMgr = new LockfileV2Manager(tmpDir);
    const lockData = lockMgr.read();
    assert.ok(lockData, 'Lockfile v2 must be created');
    assert.equal(lockData.schemaVersion, 2);
    assert.ok(lockData.managedFiles['.agents/AGENTS.md']);
    assert.ok(lockData.managedFiles['.agents/core/skills/react/SKILL.md']);
  });

  test('executeInit() is idempotent on subsequent runs', () => {
    // First run
    executeInit(tmpDir, distDir);

    // Second run
    const res2 = executeInit(tmpDir, distDir);

    assert.equal(res2.success, true);
    assert.equal(res2.plan.summary.create, 0, 'No files should be created on repeated run');
    assert.equal(res2.plan.summary.update, 0, 'No files should be updated on clean repeated run');
    assert.equal(res2.plan.summary.conflicts, 0);
    assert.equal(res2.plan.summary.skipped, 3, 'All clean files should be skipped');
  });

  test('executeInit() handles user modifications safely by generating .contextos.new sidecars', () => {
    // 1. Initial install
    executeInit(tmpDir, distDir);

    // 2. User modifies .agents/AGENTS.md
    const targetAgentsMd = path.join(tmpDir, '.agents', 'AGENTS.md');
    fs.writeFileSync(targetAgentsMd, '# User Customized Rules\n');

    // 3. Upstream updates AGENTS.md in dist
    fs.writeFileSync(path.join(distDir, 'AGENTS.md'), '# Brand New Upstream Rules\n');

    // 4. Run init again
    const res = executeInit(tmpDir, distDir);

    assert.equal(res.success, true);
    assert.equal(res.plan.summary.conflicts, 1, 'Customized file must trigger conflict');

    // User's custom file MUST be preserved
    const currentAgentsMd = fs.readFileSync(targetAgentsMd, 'utf8');
    assert.equal(currentAgentsMd, '# User Customized Rules\n');

    // Conflict sidecar MUST be created
    const sidecarPath = path.join(tmpDir, '.agents', 'AGENTS.md.contextos.new');
    assert.ok(fs.existsSync(sidecarPath), 'Conflict sidecar .contextos.new must be written');
    assert.equal(fs.readFileSync(sidecarPath, 'utf8'), '# Brand New Upstream Rules\n');
  });

  test('validateStagedFiles() catches invalid frontmatter and executeInit aborts without corrupting', () => {
    // Inject corrupt skill in distribution
    fs.writeFileSync(
      path.join(distDir, 'core', 'skills', 'react', 'SKILL.md'),
      '# Missing YAML frontmatter completely\n'
    );

    assert.throws(
      () => {
        executeInit(tmpDir, distDir, { allowPartial: false });
      },
      (err) => {
        assert.equal(err.code, 'CTX_INIT_VALIDATION_FAILED');
        return true;
      }
    );
  });
});
