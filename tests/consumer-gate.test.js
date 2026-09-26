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
});
