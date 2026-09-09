/**
 * tests/manifest-compiler.test.js
 * Unit and integration tests for ContextOS ManifestCompiler & Registry v2
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ManifestCompiler, CODES, parseYaml } = require('../.agents/compiler/manifest-compiler.js');

test('ManifestCompiler — YAML Parser', async (t) => {
  await t.test('parses scalars and booleans correctly', () => {
    const yaml = `
id: my-skill
name: "My Skill"
version: 1.2.3
enabled: true
priority: 50
ratio: 3.14
`;
    const parsed = parseYaml(yaml);
    assert.strictEqual(parsed.id, 'my-skill');
    assert.strictEqual(parsed.name, 'My Skill');
    assert.strictEqual(parsed.version, '1.2.3');
    assert.strictEqual(parsed.enabled, true);
    assert.strictEqual(parsed.priority, 50);
    assert.strictEqual(parsed.ratio, 3.14);
  });

  await t.test('parses inline and block arrays', () => {
    const yaml = `
requires: [react, typescript]
optional:
  - tailwind
  - prisma
`;
    const parsed = parseYaml(yaml);
    assert.deepStrictEqual(parsed.requires, ['react', 'typescript']);
    assert.deepStrictEqual(parsed.optional, ['tailwind', 'prisma']);
  });

  await t.test('parses nested objects and list of objects', () => {
    const yaml = `
signals:
  aliases: [foo, bar]
  keywords:
    - value: "app router"
      weight: 10
    - value: "server actions"
      weight: 15
`;
    const parsed = parseYaml(yaml);
    assert.ok(parsed.signals);
    assert.deepStrictEqual(parsed.signals.aliases, ['foo', 'bar']);
    assert.strictEqual(parsed.signals.keywords.length, 2);
    assert.strictEqual(parsed.signals.keywords[0].value, 'app router');
    assert.strictEqual(parsed.signals.keywords[0].weight, 10);
    assert.strictEqual(parsed.signals.keywords[1].value, 'server actions');
    assert.strictEqual(parsed.signals.keywords[1].weight, 15);
  });
});

test('ManifestCompiler — Production Repository Compilation', async (t) => {
  const compiler = new ManifestCompiler({ rootDir: path.resolve(__dirname, '..') });
  const result = compiler.compile();

  await t.test('compiles all repository skills with zero errors', () => {
    assert.strictEqual(result.success, true, `Diagnostics: ${JSON.stringify(result.diagnostics)}`);
    assert.ok(result.registry);
    const skillCount = Object.keys(result.registry.skills).length;
    assert.ok(skillCount >= 39, `Expected at least 39 skills, found ${skillCount}`);
  });

  await t.test('produces deterministic sourceGraphHash', () => {
    const secondRun = compiler.compile();
    assert.strictEqual(result.registry.sourceGraphHash, secondRun.registry.sourceGraphHash);
    assert.ok(result.registry.sourceGraphHash.startsWith('sha256:'));
  });

  await t.test('enriches v1 manifests with rich signals and dependencies', () => {
    const nextjs = result.registry.skills.nextjs;
    assert.ok(nextjs);
    assert.strictEqual(nextjs.id, 'nextjs');
    assert.deepStrictEqual(nextjs.dependencies.requires, ['react', 'typescript']);
    assert.ok(nextjs.signals.aliases.includes('next'));
    assert.ok(nextjs.signals.keywords.some(k => k.value === 'app router'));
    assert.ok(nextjs.signals.packages.some(p => p.name === 'next'));
    assert.ok(nextjs.entrypointHash.startsWith('sha256:'));
    assert.ok(nextjs.estimatedTokens > 0);
  });

  await t.test('correctly registers aliases and packageMap in registry', () => {
    assert.strictEqual(result.registry.aliases['next'], 'nextjs');
    assert.strictEqual(result.registry.packageMap['npm:next'], 'nextjs');
    assert.strictEqual(result.registry.packageMap['npm:react'], 'react');
    assert.deepStrictEqual(result.registry.dependencyGraph['nextjs'], ['react', 'typescript']);
  });
});

test('ManifestCompiler — Security & Guardrail Validations', async (t) => {
  // Helper to create an isolated mock workspace
  function createMockWorkspace() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-compiler-test-'));
    const coreSkills = path.join(tmp, '.agents', 'core', 'skills');
    fs.mkdirSync(coreSkills, { recursive: true });
    return { tmp, coreSkills };
  }

  function addMockSkill(coreSkills, id, yamlContent, skillMdContent = null) {
    const sDir = path.join(coreSkills, id);
    fs.mkdirSync(sDir, { recursive: true });
    fs.writeFileSync(path.join(sDir, 'skill.yaml'), yamlContent, 'utf8');
    fs.writeFileSync(path.join(sDir, 'SKILL.md'), skillMdContent || `---\nname: ${id}\ndescription: Test skill\n---\n# ${id}\n`, 'utf8');
    return sDir;
  }

  await t.test('catches self-dependency with CTX_MANIFEST_SELF_DEPENDENCY', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [alpha]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.SELF_DEPENDENCY));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches dependency cycle with CTX_MANIFEST_CYCLE_DETECTED', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [beta]\n');
    addMockSkill(coreSkills, 'beta', 'id: beta\nname: beta\nrequires: [gamma]\n');
    addMockSkill(coreSkills, 'gamma', 'id: gamma\nname: gamma\nrequires: [alpha]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.CYCLE_DETECTED));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches unknown dependency with CTX_MANIFEST_UNKNOWN_DEPENDENCY', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [non-existent-skill]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.UNKNOWN_DEPENDENCY));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches conflict violation with CTX_MANIFEST_CONFLICT_VIOLATION', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [beta]\nconflicts: [beta]\n');
    addMockSkill(coreSkills, 'beta', 'id: beta\nname: beta\nrequires: []\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.CONFLICT_VIOLATION));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches directory traversal in entrypoint with CTX_MANIFEST_INVALID_PATH', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nentrypoint: ../../../etc/passwd\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.INVALID_PATH));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches missing entrypoint on disk with CTX_MANIFEST_MISSING_ENTRYPOINT', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    const sDir = path.join(coreSkills, 'alpha');
    fs.mkdirSync(sDir, { recursive: true });
    fs.writeFileSync(path.join(sDir, 'skill.yaml'), 'id: alpha\nname: alpha\nentrypoint: NON_EXISTENT.md\n', 'utf8');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.MISSING_ENTRYPOINT));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches missing declared resource with CTX_MANIFEST_MISSING_RESOURCE', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nresources: [missing-file.md]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.MISSING_RESOURCE));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('formats diagnostics as valid SARIF 2.1.0', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [ghost]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    compiler.compile();
    const sarif = compiler.formatSarif();

    assert.strictEqual(sarif.version, '2.1.0');
    assert.strictEqual(sarif.runs.length, 1);
    assert.strictEqual(sarif.runs[0].tool.driver.name, 'contextos-manifest-compiler');
    assert.ok(sarif.runs[0].results.length > 0);
    assert.strictEqual(sarif.runs[0].results[0].ruleId, CODES.UNKNOWN_DEPENDENCY);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
