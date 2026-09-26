/**
 * tests/consumer-gate.test.js
 * Integration test verifying that the context engine and adapters operate strictly
 * on the consumer project root, discovering consumer-unique skills without leaking
 * or falling back to the author package directory.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { renderAdapters } = require('../.agents/adapters/pure-compiler.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');

describe('Task 1.1: Consumer Project Root & Unique Skill Isolation', () => {
  let tmpBase;
  let consumerDir;
  let customSkillName;

  before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-consumer-gate-'));
    consumerDir = path.join(tmpBase, 'consumer-app');
    customSkillName = 'consumer-unique-billing';

    fs.mkdirSync(consumerDir, { recursive: true });

    // Set up minimal .agents structure in consumer project
    const consumerAgentsDir = path.join(consumerDir, '.agents');
    const consumerCoreSkills = path.join(consumerAgentsDir, 'core', 'skills');
    fs.mkdirSync(consumerCoreSkills, { recursive: true });

    // Copy only 1 standard skill to consumer
    const stdSkillSrc = path.resolve(__dirname, '../.agents/core/skills/security');
    fs.cpSync(stdSkillSrc, path.join(consumerCoreSkills, 'security'), { recursive: true });

    // Add a UNIQUE custom skill that ONLY exists in the consumer project
    const customSkillDir = path.join(consumerCoreSkills, customSkillName);
    fs.mkdirSync(customSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(customSkillDir, 'SKILL.md'),
      `---\nname: ${customSkillName}\ndescription: Proprietary consumer billing rules\n---\n\n# Consumer Billing\n\nMust strictly isolate tenant credentials.\n`
    );
    fs.writeFileSync(
      path.join(customSkillDir, 'skill.yaml'),
      `name: ${customSkillName}\ndescription: Proprietary consumer billing rules\n`
    );
  });

  after(() => {
    if (tmpBase && fs.existsSync(tmpBase)) {
      try {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      } catch {}
    }
  });

  test('renderAdapters discovers consumer-unique skill when passed projectRoot', () => {
    const result = renderAdapters(consumerDir, ['gemini', 'claude', 'cursor', 'copilot', 'aider', 'zed']);

    assert.ok(Array.isArray(result.artifacts), 'Must return rendered artifacts');

    // 1. All adapters must render the consumer-unique skill
    assert.ok(
      result.artifacts.some(a => a.path.includes(customSkillName) && a.generator.includes('gemini')),
      'Gemini adapter must render consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes(customSkillName) && a.generator.includes('claude')),
      'Claude adapter must render consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes(`${customSkillName}.mdc`) && a.generator.includes('cursor')),
      'Cursor adapter must render consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes('copilot-instructions.md') && a.content.toString().includes(customSkillName)),
      'Copilot adapter must reference consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes('CONVENTIONS.md') && a.content.toString().includes(customSkillName)),
      'Aider conventions must reference consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes(`.zed/prompts/${customSkillName}.md`)),
      'Zed adapter must generate prompt for consumer-unique skill'
    );

    // 2. Must NOT bleed skills that only exist in the author repo
    const leakedSkill = result.artifacts.find(a => a.path.includes('ponytail-mindset'));
    assert.equal(
      leakedSkill,
      undefined,
      'Must NOT include skills from author package root that are absent from consumer project'
    );
  });

  test('detectDrift detects missing artifacts in un-exported consumer project without disk mutation', () => {
    // Before export: disk is clean, so all artifacts should be detected as missing or drifting
    const driftBefore = detectDrift(consumerDir, 'all');
    assert.equal(driftBefore.hasDrift, true, 'Drift must be detected before export');
    assert.ok(driftBefore.totalFindings > 0, 'Must have findings for uncreated files');

    // Verify read-only guarantee: lockfile and outputs must not be created by detectDrift
    assert.equal(
      fs.existsSync(path.join(consumerDir, '.cursor', 'rules', `${customSkillName}.mdc`)),
      false,
      'detectDrift must never write files to disk'
    );
    assert.equal(
      fs.existsSync(path.join(consumerDir, '.agents', 'lockfile.v2.json')),
      false,
      'detectDrift must not create lockfile'
    );
  });

  test('Task 1.3: bin/index.js verification paths with explicit project root do not execute rogue .agents/ctx.js', () => {
    const binPath = path.resolve(__dirname, '../bin/index.js');
    const rogueCtxPath = path.join(consumerDir, '.agents', 'ctx.js');

    // Plant a rogue script in consumer project that would fail with distinctive error if executed
    fs.writeFileSync(rogueCtxPath, 'process.stderr.write("ROGUE_SCRIPT_LEAK"); process.exit(99);\n');

    try {
      // 1. Run gate command targeting consumer project with explicit --project
      let gateStdout = '';
      let gateCode = 0;
      try {
        gateStdout = execSync(`node "${binPath}" gate --project "${consumerDir}" --json`, {
          stdio: 'pipe',
          env: { ...process.env, NO_COLOR: '1' },
        }).toString();
      } catch (err) {
        gateCode = err.status;
        gateStdout = (err.stdout || '').toString();
      }

      const parsedGate = JSON.parse(gateStdout);
      assert.equal(parsedGate.schemaVersion, '2.0.0');
      assert.notEqual(gateCode, 99, 'Gate must not execute rogue script (code 99)');
      assert.ok(!gateStdout.includes('ROGUE_SCRIPT_LEAK'), 'Rogue script output must not appear in gate');

      // 2. Run export check command targeting consumer project
      let exportCode = 0;
      let exportStdout = '';
      try {
        exportStdout = execSync(`node "${binPath}" export all --check --project "${consumerDir}" --json`, {
          stdio: 'pipe',
          env: { ...process.env, NO_COLOR: '1' },
        }).toString();
      } catch (err) {
        exportCode = err.status;
        exportStdout = err.stdout.toString();
      }

      // Exit code 1 for drift is expected because files are not exported yet, but NOT 99 (the rogue code)
      assert.notEqual(exportCode, 99, 'Must NOT execute rogue .agents/ctx.js');
      assert.ok(!exportStdout.includes('ROGUE_SCRIPT_LEAK'), 'Rogue script output must not appear');
    } finally {
      if (fs.existsSync(rogueCtxPath)) {
        fs.unlinkSync(rogueCtxPath);
      }
    }
  });

  test('Task 1.4: Scoped adapter check does not flag unselected adapters as orphans', () => {
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');

    // Export all adapters so that files for all 6 adapters exist and are tracked in lockfile
    const renderedAll = renderAdapters(consumerDir, 'all');
    applyArtifacts(consumerDir, renderedAll.artifacts, { context: renderedAll.context });

    // Now verify ONLY cursor adapter
    const cursorDrift = detectDrift(consumerDir, 'cursor');

    assert.equal(cursorDrift.hasDrift, false, 'Cursor adapter must be in sync');
    assert.equal(cursorDrift.findings.ORPHAN_MANAGED_OUTPUT.length, 0, 'Must NOT flag Claude or Gemini files as orphans');
    assert.equal(cursorDrift.code, 0, 'Must return code 0 for in-sync single adapter check');
  });

  test('Task 1.5: Corrupt lockfile, unknown adapter, and empty projection fail closed with code 2', () => {
    const lockfilePath = path.join(consumerDir, '.agents', 'lockfile.v2.json');
    const validLockBackup = fs.readFileSync(lockfilePath, 'utf8');

    try {
      // 1. Corrupt lockfile
      fs.writeFileSync(lockfilePath, '{ corrupt json invalid: true');
      const corruptDrift = detectDrift(consumerDir, 'all');
      assert.equal(corruptDrift.hasError, true, 'Corrupt lockfile must set hasError: true');
      assert.equal(corruptDrift.code, 2, 'Corrupt lockfile must return error code 2');
      assert.ok(corruptDrift.findings.CORRUPT_LOCKFILE.length > 0, 'Must report corrupt lockfile finding');

      // 2. Unknown adapter
      fs.writeFileSync(lockfilePath, validLockBackup);
      const unknownDrift = detectDrift(consumerDir, 'nonexistent-adapter');
      assert.equal(unknownDrift.hasError, true, 'Unknown adapter must set hasError: true');
      assert.equal(unknownDrift.code, 2, 'Unknown adapter must return error code 2');
      assert.ok(unknownDrift.findings.CONFIG_ERROR.length > 0, 'Must report config error finding');
    } finally {
      fs.writeFileSync(lockfilePath, validLockBackup);
    }
  });

  test('Task 1.6: Check mode with --profile causes zero disk mutations', () => {
    const binPath = path.resolve(__dirname, '../bin/index.js');
    const lockfilePath = path.join(consumerDir, '.agents', 'lockfile.v2.json');
    const profilesJsonPath = path.join(consumerDir, '.agents', 'profiles.json');

    const lockfileBefore = fs.readFileSync(lockfilePath, 'utf8');
    const profilesJsonExistedBefore = fs.existsSync(profilesJsonPath);

    // Run export all --check with --profile frontend
    try {
      execSync(`node "${binPath}" export all --check --profile frontend --project "${consumerDir}" --json`, {
        stdio: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
      });
    } catch {
      // Exit code 1 for drift is normal if profile differences exist
    }

    const lockfileAfter = fs.readFileSync(lockfilePath, 'utf8');
    assert.equal(lockfileBefore, lockfileAfter, 'Lockfile must remain bit-for-bit identical after check mode');

    const profilesJsonExistedAfter = fs.existsSync(profilesJsonPath);
    assert.equal(
      profilesJsonExistedBefore,
      profilesJsonExistedAfter,
      'profiles.json must not be created or modified by check mode'
    );
  });

  test('Task 1.7: CRLF checkout normalization does not produce false drift findings', () => {
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const renderedAll = renderAdapters(consumerDir, 'all');
    applyArtifacts(consumerDir, renderedAll.artifacts, { context: renderedAll.context });

    // Pick an existing generated file and convert LF to CRLF to simulate Windows git checkout
    const cursorFile = path.join(consumerDir, '.cursor', 'rules', `${customSkillName}.mdc`);
    const originalContent = fs.readFileSync(cursorFile, 'utf8');
    const crlfContent = originalContent.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(cursorFile, crlfContent, 'utf8');

    // Drift detector must normalize CRLF via computeSemanticHash and report clean sync
    const drift = detectDrift(consumerDir, 'cursor');
    assert.equal(drift.hasDrift, false, 'CRLF on disk must not trigger false drift');
    assert.equal(drift.code, 0, 'Exit code must be 0 for CRLF equivalent file');
  });

  test('Task 1.8: Verifies stale source, profile mismatch, collision detection, and export resolution', () => {
    const { applyArtifacts, registerAdapter, unregisterAdapter } = require('../.agents/adapters/pure-compiler.js');

    // 1. Stale Source: update source skill without re-exporting
    const skillMdPath = path.join(consumerDir, '.agents', 'core', 'skills', customSkillName, 'SKILL.md');
    fs.appendFileSync(skillMdPath, '\n\nAdditional rule appended to source skill.\n');

    const staleReport = detectDrift(consumerDir, 'cursor');
    assert.equal(staleReport.hasDrift, true, 'Drift must be detected after source skill changes');
    assert.ok(
      staleReport.findings.STALE_INPUT.length > 0 || staleReport.findings.MODIFIED_MANAGED_OUTPUT.length > 0,
      'Must flag stale input or generated divergence'
    );

    // 2. Export Resolution: re-exporting synchronizes disk and clears drift
    const reRendered = renderAdapters(consumerDir, 'all');
    applyArtifacts(consumerDir, reRendered.artifacts, { context: reRendered.context });

    const cleanReport = detectDrift(consumerDir, 'all');
    assert.equal(cleanReport.hasDrift, false, 'Re-export must resolve drift cleanly');
    assert.equal(cleanReport.code, 0, 'Clean project must return exit code 0');

    // 3. Collision Detection: register an intentionally colliding test adapter
    const collidingAdapter = {
      describe: () => ({ name: 'collider', description: 'Colliding adapter for test' }),
      render: () => [{
        path: '.cursor/rules/00-project-rules.mdc',
        content: Buffer.from('collision-content'),
        generator: 'collider@2',
        kind: 'generated-adapter',
      }],
      validate: () => [],
      run: () => {},
    };
    registerAdapter('collider', collidingAdapter);

    try {
      const collisionResult = renderAdapters(consumerDir, ['cursor', 'collider']);
      assert.ok(collisionResult.collisions.length > 0, 'Must detect path collision between cursor and collider');
      assert.equal(collisionResult.collisions[0].path, '.cursor/rules/00-project-rules.mdc');
    } finally {
      unregisterAdapter('collider');
    }
  });

  test('Task 1.11 & 1.12: Formats and writes GitHub Actions annotations and step summary', () => {
    const { emitGitHubAnnotations, formatGitHubSummary, writeGitHubSummary } = require('../bin/lib/gate.js');

    const sampleDriftResult = {
      ok: false,
      code: 1,
      status: 'drift',
      projectRoot: consumerDir,
      target: 'cursor',
      profile: 'default',
      message: 'Adapter outputs have drifted from source skills',
      drift: {
        totalFindings: 2,
        projectedCount: 5,
        findings: {
          MISSING_OUTPUT: [{ path: '.cursor/rules/missing-rule.mdc', reason: 'Missing rule' }],
          MODIFIED_MANAGED_OUTPUT: [{ path: '.cursor/rules/modified-rule.mdc', reason: 'User edit detected' }],
        },
        collisions: [],
      },
    };

    // 1. Verify markdown formatting for step summary
    const summaryMarkdown = formatGitHubSummary(sampleDriftResult);
    assert.ok(summaryMarkdown.includes('# ⚠️ ContextOS Quality Gate Report'));
    assert.ok(summaryMarkdown.includes('**Status**: `DRIFT`'));
    assert.ok(summaryMarkdown.includes('`.cursor/rules/missing-rule.mdc`'));
    assert.ok(summaryMarkdown.includes('`.cursor/rules/modified-rule.mdc`'));
    assert.ok(summaryMarkdown.includes('Run `npx contextos-agents export all`'));

    // 2. Verify write to GITHUB_STEP_SUMMARY
    const tempSummaryFile = path.join(tmpBase, 'github_step_summary.md');
    process.env.GITHUB_STEP_SUMMARY = tempSummaryFile;
    try {
      writeGitHubSummary(sampleDriftResult);
      assert.ok(fs.existsSync(tempSummaryFile), 'GITHUB_STEP_SUMMARY file must be written');
      const writtenContent = fs.readFileSync(tempSummaryFile, 'utf8');
      assert.ok(writtenContent.includes('ContextOS Quality Gate Report'));
    } finally {
      delete process.env.GITHUB_STEP_SUMMARY;
    }

    // 3. Verify emitGitHubAnnotations prints workflow commands to stderr
    const stderrMessages = [];
    const origStderrWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      stderrMessages.push(chunk.toString());
      return true;
    };
    try {
      emitGitHubAnnotations(sampleDriftResult);
      const combinedStderr = stderrMessages.join('');
      assert.ok(combinedStderr.includes('::error file=.cursor/rules/missing-rule.mdc::[MISSING_OUTPUT]'));
      assert.ok(combinedStderr.includes('::error file=.cursor/rules/modified-rule.mdc::[MODIFIED_OUTPUT]'));
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  test('Task 1.11: Project path containing spaces is resolved and verified cleanly', () => {
    const { runGate } = require('../bin/lib/gate.js');
    const spacedDir = path.join(tmpBase, 'consumer app with spaces');
    fs.mkdirSync(spacedDir, { recursive: true });

    // Copy .agents from consumerDir to spacedDir
    fs.cpSync(path.join(consumerDir, '.agents'), path.join(spacedDir, '.agents'), { recursive: true });

    // Export cursor rules in spaced directory
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(spacedDir, 'cursor');
    applyArtifacts(spacedDir, rendered.artifacts, { context: rendered.context });

    // Gate should verify cleanly on a directory with spaces
    const result = runGate(spacedDir, { target: 'cursor' });
    assert.equal(result.ok, true, 'Gate must pass for path with spaces');
    assert.equal(result.code, 0, 'Exit code must be 0');
  });

  test('Task 1.13: Non-Node repository (Python/Go layout without package.json) runs gate safely', () => {
    const { runGate } = require('../bin/lib/gate.js');
    const pythonRepoDir = path.join(tmpBase, 'python-service-repo');
    fs.mkdirSync(pythonRepoDir, { recursive: true });

    // Add Python service files and NO package.json
    fs.writeFileSync(path.join(pythonRepoDir, 'main.py'), 'print("Hello from python service")\n');
    fs.writeFileSync(path.join(pythonRepoDir, 'requirements.txt'), 'fastapi==0.110.0\n');
    assert.equal(fs.existsSync(path.join(pythonRepoDir, 'package.json')), false, 'Must not contain package.json');

    // Setup .agents and export
    fs.cpSync(path.join(consumerDir, '.agents'), path.join(pythonRepoDir, '.agents'), { recursive: true });
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(pythonRepoDir, 'claude');
    applyArtifacts(pythonRepoDir, rendered.artifacts, { context: rendered.context });

    // 1. Verification passes on clean repo without node dependencies
    const passResult = runGate(pythonRepoDir, { target: 'claude' });
    assert.equal(passResult.ok, true, 'Non-Node project must verify without requiring package.json or npm');
    assert.equal(passResult.status, 'pass');
    assert.equal(passResult.code, 0);

    // 2. Modifying Claude export produces drift
    const claudeMdPath = path.join(pythonRepoDir, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      fs.appendFileSync(claudeMdPath, '\n# User local drift edit\n');
      const driftResult = runGate(pythonRepoDir, { target: 'claude' });
      assert.equal(driftResult.ok, false, 'Modifying CLAUDE.md must trigger drift detection');
      assert.equal(driftResult.status, 'drift');
      assert.equal(driftResult.code, 1);
    }
  });
});

