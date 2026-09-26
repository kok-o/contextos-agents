/**
 * tests/adapter-compatibility.test.js
 * Comprehensive integration tests for Phase 2: Adapter Compatibility Matrix,
 * Scope Isolation, Coexistence, and Custom File Preservation.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  renderAdapters,
  listAdapters,
  applyArtifacts,
  computeExactHash,
  computeSemanticHash,
} = require('../.agents/adapters/pure-compiler.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');

describe('Phase 2: Adapter Compatibility & Technical Contracts', () => {
  let tmpBase;
  let fixtureDir;
  const fixtureSrc = path.resolve(__dirname, 'fixtures', 'adapter-contracts');

  before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-adapter-compat-'));
    fixtureDir = path.join(tmpBase, 'consumer-project');
    fs.mkdirSync(fixtureDir, { recursive: true });

    // Copy fixture files to isolated working directory
    fs.cpSync(fixtureSrc, fixtureDir, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  test('Task 2.1 & 2.10: All 6 adapters render concurrently without path collisions', () => {
    const adapters = listAdapters();
    assert.deepEqual(
      adapters.sort(),
      ['aider', 'claude', 'copilot', 'cursor', 'gemini', 'zed'].sort(),
      'All 6 standard adapters must be registered'
    );

    const result = renderAdapters(fixtureDir, 'all');
    assert.equal(result.collisions.length, 0, 'Cross-adapter path collisions must be 0');
    assert.ok(result.artifacts.length >= 10, 'Must produce projected artifacts across all adapters');

    // Confirm that every adapter produces artifacts
    const generators = new Set(result.artifacts.map(a => a.generator));
    assert.ok(generators.has('cursor@2'), 'Cursor artifacts must be present');
    assert.ok(generators.has('claude@2'), 'Claude artifacts must be present');
    assert.ok(generators.has('gemini@2'), 'Gemini artifacts must be present');
    assert.ok(generators.has('copilot@2'), 'Copilot artifacts must be present');
    assert.ok(generators.has('aider@2'), 'Aider artifacts must be present');
    assert.ok(generators.has('zed@2'), 'Zed artifacts must be present');
  });

  test('Task 2.2 & 2.3: Cursor rules verify MDC frontmatter, scopes, and globs', () => {
    const rendered = renderAdapters(fixtureDir, 'cursor');
    assert.equal(rendered.collisions.length, 0);

    const findArtifact = (name) =>
      rendered.artifacts.find(a => a.path.includes(name));

    // 1. Root project rules (alwaysApply: true)
    const projectRules = findArtifact('00-project-rules.mdc');
    assert.ok(projectRules, 'Must generate .cursor/rules/00-project-rules.mdc');
    const projectContent = projectRules.content.toString('utf8');
    assert.ok(projectContent.includes('alwaysApply: true'), '00-project-rules must have alwaysApply: true');
    assert.ok(projectContent.includes('CORE_PROJECT_CONTRACT_MARKER_V2'), 'Must include project marker');

    // 2. Scoped Frontend Rule (globs from skill.yaml)
    const frontendRule = findArtifact('scoped-frontend.mdc');
    assert.ok(frontendRule, 'Must generate .cursor/rules/scoped-frontend.mdc');
    const frontendContent = frontendRule.content.toString('utf8');
    assert.ok(frontendContent.includes('alwaysApply: false'), 'Domain skill must have alwaysApply: false');
    assert.ok(frontendContent.includes('src/components/**/*.{tsx,jsx}'), 'Must extract globs from skill.yaml');
    assert.ok(frontendContent.includes('FRONTEND_SCOPED_RULE_MARKER'), 'Must include frontend marker');

    // 3. Scoped Backend Rule (globs from skill.yaml)
    const backendRule = findArtifact('scoped-backend.mdc');
    assert.ok(backendRule, 'Must generate .cursor/rules/scoped-backend.mdc');
    const backendContent = backendRule.content.toString('utf8');
    assert.ok(backendContent.includes('alwaysApply: false'), 'Domain skill must have alwaysApply: false');
    assert.ok(backendContent.includes('src/api/**/*.ts'), 'Must extract globs from skill.yaml');
    assert.ok(backendContent.includes('BACKEND_SCOPED_RULE_MARKER'), 'Must include backend marker');
  });

  test('Task 2.4: Claude Code export compiles clean markdown without YAML frontmatter', () => {
    const rendered = renderAdapters(fixtureDir, 'claude');
    assert.equal(rendered.collisions.length, 0);

    const frontendClaude = rendered.artifacts.find(a =>
      a.path === '.agents/generated/claude/skills/scoped-frontend/SKILL.md'
    );
    assert.ok(frontendClaude, 'Must generate Claude skill file');
    const content = frontendClaude.content.toString('utf8');

    // Must be clean markdown without YAML frontmatter header
    assert.ok(!content.startsWith('---'), 'Claude skill must strip YAML frontmatter');
    assert.ok(content.includes('FRONTEND_SCOPED_RULE_MARKER'), 'Must retain skill body');
  });

  test('Task 2.5: Gemini CLI export maintains native skills and YAML frontmatter', () => {
    const rendered = renderAdapters(fixtureDir, 'gemini');
    assert.equal(rendered.collisions.length, 0);

    const nativeSkill = rendered.artifacts.find(a =>
      a.path === '.agents/skills/scoped-backend/SKILL.md'
    );
    assert.ok(nativeSkill, 'Must generate .agents/skills/<skill>/SKILL.md for Gemini');
    const content = nativeSkill.content.toString('utf8');

    assert.ok(content.startsWith('---'), 'Gemini skill must contain YAML frontmatter');
    assert.ok(content.includes('name: scoped-backend'), 'Frontmatter must have skill name');
    assert.ok(content.includes('BACKEND_SCOPED_RULE_MARKER'), 'Body must retain marker');
  });

  test('Task 2.6: GitHub Copilot export compiles instructions and routing library', () => {
    const rendered = renderAdapters(fixtureDir, 'copilot');
    assert.equal(rendered.collisions.length, 0);

    const copilotArt = rendered.artifacts.find(a =>
      a.path === '.github/copilot-instructions.md'
    );
    assert.ok(copilotArt, 'Must generate .github/copilot-instructions.md');
    const content = copilotArt.content.toString('utf8');

    assert.ok(content.includes('GitHub Copilot Instructions'), 'Must contain header');
    assert.ok(content.includes('Skill Routing Table'), 'Must contain routing table');
    assert.ok(content.includes('scoped-frontend'), 'Must reference scoped-frontend');
    assert.ok(content.includes('scoped-backend'), 'Must reference scoped-backend');
  });

  test('Task 2.7: Zed IDE export compiles project rules and slash prompt templates', () => {
    const rendered = renderAdapters(fixtureDir, 'zed');
    assert.equal(rendered.collisions.length, 0);

    const zedRules = rendered.artifacts.find(a => a.path === '.zed/rules.md');
    assert.ok(zedRules, 'Must generate .zed/rules.md');

    const promptTemplate = rendered.artifacts.find(a =>
      a.path === '.zed/prompts/scoped-frontend.md'
    );
    assert.ok(promptTemplate, 'Must generate .zed/prompts/scoped-frontend.md');
    const promptContent = promptTemplate.content.toString('utf8');
    assert.ok(promptContent.includes('FRONTEND_SCOPED_RULE_MARKER'), 'Prompt template must retain skill content');
  });

  test('Task 2.8: Aider export preserves pre-existing user settings in .aider.conf.yml', () => {
    // Simulate pre-existing user .aider.conf.yml with custom flags
    const userAiderConf = path.join(fixtureDir, '.aider.conf.yml');
    fs.writeFileSync(
      userAiderConf,
      'model: claude-3-5-sonnet-20241022\nauto-commits: false\nmap-tokens: 2048\n',
      'utf8'
    );

    const rendered = renderAdapters(fixtureDir, 'aider');
    assert.equal(rendered.collisions.length, 0);

    const aiderConfArt = rendered.artifacts.find(a => a.path === '.aider.conf.yml');
    assert.ok(aiderConfArt, 'Must render .aider.conf.yml');
    const conventionsArt = rendered.artifacts.find(a => a.path === 'CONVENTIONS.md');
    assert.ok(conventionsArt, 'Must render CONVENTIONS.md');

    // Apply artifacts to disk
    applyArtifacts(fixtureDir, rendered.artifacts, { context: rendered.context });

    // Verify .aider.conf.yml retains CONVENTIONS.md and user custom settings
    const updatedConf = fs.readFileSync(userAiderConf, 'utf8');
    assert.ok(updatedConf.includes('CONVENTIONS.md'), 'Must configure CONVENTIONS.md in read');
    assert.ok(updatedConf.includes('claude-3-5-sonnet-20241022'), 'Must preserve user model setting');
    assert.ok(updatedConf.includes('map-tokens'), 'Must preserve user map-tokens setting');
  });

  test('Task 2.9: Antigravity IDE workspace rules isolation', () => {
    const rendered = renderAdapters(fixtureDir, 'all');

    // Verify that NO adapter targets .agents/rules/
    // (.agents/rules/ is ContextOS internal rule engine catalog and must never be overwritten)
    for (const art of rendered.artifacts) {
      assert.ok(
        !art.path.startsWith('.agents/rules/'),
        `Adapter must not overwrite ContextOS internal rule catalog (.agents/rules/): ${art.path}`
      );
    }
  });

  test('Task 2.11: User-created rules and prompts outside ContextOS are preserved on sync', () => {
    // 1. Create a user-authored custom rule in Cursor directory
    const userCursorRule = path.join(fixtureDir, '.cursor', 'rules', 'user-custom-rule.mdc');
    fs.mkdirSync(path.dirname(userCursorRule), { recursive: true });
    fs.writeFileSync(userCursorRule, '---\ndescription: User rule\nglobs: "*"\n---\n# User Custom Rule\n', 'utf8');

    // 2. Create a user-authored custom prompt in Zed directory
    const userZedPrompt = path.join(fixtureDir, '.zed', 'prompts', 'custom-deploy.md');
    fs.mkdirSync(path.dirname(userZedPrompt), { recursive: true });
    fs.writeFileSync(userZedPrompt, '# Custom deploy prompt\nRun deployment checklist.\n', 'utf8');

    // Re-apply all adapters
    const rendered = renderAdapters(fixtureDir, 'all');
    applyArtifacts(fixtureDir, rendered.artifacts, { context: rendered.context });

    // User files must still exist!
    assert.ok(fs.existsSync(userCursorRule), 'Custom user .cursor/rules must not be deleted');
    assert.ok(fs.existsSync(userZedPrompt), 'Custom user .zed/prompts must not be deleted');
  });

  test('Task 2.13: Deterministic byte reproducibility & zero drift across re-exports', () => {
    // First export
    const rendered1 = renderAdapters(fixtureDir, 'all');
    applyArtifacts(fixtureDir, rendered1.artifacts, { context: rendered1.context });

    // Verify drift detector reports 0 drift
    const driftCheck1 = detectDrift(fixtureDir, 'all');
    assert.equal(driftCheck1.hasDrift, false, 'Must have zero drift after export');
    assert.equal(driftCheck1.code, 0);

    // Second export produces identical hashes
    const rendered2 = renderAdapters(fixtureDir, 'all');
    assert.equal(rendered1.artifacts.length, rendered2.artifacts.length);
    for (let i = 0; i < rendered1.artifacts.length; i++) {
      const h1 = computeExactHash(rendered1.artifacts[i].content);
      const h2 = computeExactHash(rendered2.artifacts[i].content);
      assert.equal(h1, h2, `Artifact ${rendered1.artifacts[i].path} must have byte-identical hash`);
    }
  });
});
