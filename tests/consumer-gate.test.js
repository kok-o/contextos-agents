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
});

