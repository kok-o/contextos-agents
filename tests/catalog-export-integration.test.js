/**
 * tests/catalog-export-integration.test.js
 * Integration test verifying catalog skills installation, compilation,
 * adapter export (Gemini, Claude, Cursor, Copilot, Aider, Zed), and example validity.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
const { renderAdapters } = require('../.agents/adapters/pure-compiler.js');

describe('Catalog Skills Export & Verification Integration', () => {
  let tmpDir;
  let agentsDir;
  let coreSkillsDir;
  let origCwd;

  before(() => {
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-catalog-export-'));
    agentsDir = path.join(tmpDir, '.agents');
    coreSkillsDir = path.join(agentsDir, 'core', 'skills');

    fs.mkdirSync(coreSkillsDir, { recursive: true });

    // Copy core skills
    const coreDir = path.resolve(__dirname, '../.agents/core/skills');
    fs.cpSync(coreDir, coreSkillsDir, { recursive: true });

    // Install 3 representative catalog skills into test project's skills
    const catalogDir = path.resolve(__dirname, '../catalog/skills');
    const skillsToTest = ['fastapi', 'web-accessibility', 'adapters'];

    for (const skillName of skillsToTest) {
      const src = path.join(catalogDir, skillName);
      const dest = path.join(coreSkillsDir, skillName);
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
      }
    }

    // Copy minimal schemas & config
    const schemasDir = path.resolve(__dirname, '../.agents/schemas');
    if (fs.existsSync(schemasDir)) {
      fs.cpSync(schemasDir, path.join(agentsDir, 'schemas'), { recursive: true });
    }

    // Switch cwd to tmpDir so relative loaders discover test project skills
    process.chdir(tmpDir);
  });

  after(() => {
    if (origCwd) {
      process.chdir(origCwd);
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('compiles registry v2 including installed catalog skills', () => {
    const compiler = new ManifestCompiler({ rootDir: tmpDir });
    const result = compiler.compileAndWrite();

    assert.ok(result.success, 'Compilation must succeed');
    assert.ok(result.registry.skills['fastapi'], 'Registry must include fastapi');
    assert.ok(result.registry.skills['web-accessibility'], 'Registry must include web-accessibility');
    assert.ok(result.registry.skills['adapters'], 'Registry must include adapters');

    const regFile = path.join(agentsDir, 'compiled', 'registry.v2.json');
    assert.ok(fs.existsSync(regFile), 'registry.v2.json must be written to disk');
  });

  test('pure compiler renders all 6 adapters for installed catalog skills', () => {
    const adapters = ['gemini', 'claude', 'cursor', 'copilot', 'aider', 'zed'];
    const result = renderAdapters(tmpDir, adapters);

    assert.ok(Array.isArray(result.artifacts), 'Must produce artifacts array');
    assert.equal(result.collisions.length, 0, 'No adapter collision allowed');

    const artifactPaths = result.artifacts.map((a) => a.path);

    // 1. Cursor MDC rules for catalog skills
    assert.ok(
      artifactPaths.some((p) => p.includes('.cursor/rules/fastapi.mdc')),
      'Cursor adapter must generate fastapi.mdc'
    );
    assert.ok(
      artifactPaths.some((p) => p.includes('.cursor/rules/web-accessibility.mdc')),
      'Cursor adapter must generate web-accessibility.mdc'
    );

    // 2. Copilot instructions contains catalog sections
    const copilotArtifact = result.artifacts.find((a) => a.path.includes('copilot-instructions.md'));
    assert.ok(copilotArtifact, 'Copilot instructions must be generated');
    const copilotContent = copilotArtifact.content.toString('utf8');
    assert.ok(copilotContent.includes('fastapi'), 'Copilot instructions must reference fastapi');
    assert.ok(
      copilotContent.includes('web-accessibility'),
      'Copilot instructions must reference web-accessibility'
    );

    // 3. Gemini / Claude generated skills
    assert.ok(
      artifactPaths.some((p) => p.includes('generated/gemini/skills/fastapi/SKILL.md')),
      'Gemini adapter must compile fastapi SKILL.md'
    );
    assert.ok(
      artifactPaths.some((p) => p.includes('generated/claude/skills/web-accessibility/SKILL.md')),
      'Claude adapter must compile web-accessibility SKILL.md'
    );
  });

  test('validates technical correctness of code patterns in catalog skills', () => {
    const catalogDir = path.resolve(__dirname, '../catalog/skills');

    // 1. FastAPI: verify PyJWT and ConfigDict without lazy stubs
    const fastapiSkill = fs.readFileSync(path.join(catalogDir, 'fastapi', 'SKILL.md'), 'utf8');
    assert.ok(fastapiSkill.includes('ConfigDict'), 'Must import ConfigDict');
    assert.ok(fastapiSkill.includes('import jwt'), 'Must import jwt');
    assert.ok(!fastapiSkill.includes('payload = ...'), 'Must not contain lazy ellipsis stubs');

    // 2. Web Accessibility: verify native HTMLDialogElement with .showModal()
    const a11ySkill = fs.readFileSync(path.join(catalogDir, 'web-accessibility', 'SKILL.md'), 'utf8');
    assert.ok(a11ySkill.includes('HTMLDialogElement'), 'Must reference HTMLDialogElement');
    assert.ok(a11ySkill.includes('.showModal()'), 'Must use .showModal() for native focus and inertness');
    assert.ok(a11ySkill.includes('onCancel='), 'Must handle cancel event');

    // 3. Adapters: verify correct CLI commands
    const adaptersSkill = fs.readFileSync(path.join(catalogDir, 'adapters', 'SKILL.md'), 'utf8');
    assert.ok(adaptersSkill.includes('contextos export'), 'Must use real command "contextos export"');
    assert.ok(!adaptersSkill.includes('ctx adapt'), 'Must not contain phantom "ctx adapt"');

    // 4. Security: verify OWASP SSRF allowlist pattern
    const secSkill = fs.readFileSync(path.resolve(__dirname, '../.agents/core/skills/security/SKILL.md'), 'utf8');
    assert.ok(secSkill.includes('fetchFromAllowlist'), 'Must provide allowlist-based client');
    assert.ok(secSkill.includes("redirect: 'error'"), 'Must disable automatic HTTP redirects');
    assert.ok(!secSkill.includes('Pinned connection or custom dispatcher prevents DNS rebinding (TOCTOU)\n  return fetch(urlString'), 'Must not contain fake pinning comment');
  });
});
