'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { renderAdapters, applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');
const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
const { SkillCustomizationManager } = require('../.agents/customization-dx.js');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-stabilization-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'ctx-stabilization-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.cpSync(path.join(__dirname, '../.agents/core/skills'), path.join(root, '.agents/core/skills'), { recursive: true });
  return root;
}
function apply(root, targets) {
  const rendered = renderAdapters(root, targets);
  assert.equal(rendered.collisions.length, 0);
  return applyArtifacts(root, rendered.artifacts, { context: rendered.context });
}

test('Copilot preserves user rules before and after two exports', t => {
  const root = fixture(t);
  const target = path.join(root, '.github/copilot-instructions.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '# USER RULE\nUse the internal package registry.\n');
  apply(root, 'copilot');
  fs.appendFileSync(target, '\nSECOND USER RULE\n');
  apply(root, 'copilot');
  const content = fs.readFileSync(target, 'utf8');
  assert.ok(content.startsWith('# USER RULE\nUse the internal package registry.\n'));
  assert.ok(content.endsWith('\nSECOND USER RULE\n'));
  assert.equal(content.split('<!-- CONTEXTOS:START -->').length, 2);
  assert.equal(detectDrift(root, 'copilot').hasDrift, false);
});

test('Malformed Copilot blocks fail without changing user content', t => {
  const root = fixture(t);
  const target = path.join(root, '.github/copilot-instructions.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const original = 'USER RULE\n<!-- CONTEXTOS:START -->\n';
  fs.writeFileSync(target, original);
  assert.throws(() => apply(root, 'copilot'), /Malformed/);
  assert.equal(fs.readFileSync(target, 'utf8'), original);
});

test('Modified generated artifacts and user-owned files refuse replacement atomically', t => {
  const root = fixture(t);
  const customPath = '.cursor/rules/custom.mdc';
  fs.mkdirSync(path.join(root, '.cursor/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, customPath), 'USER RULE');
  assert.throws(() => applyArtifacts(root, [{ path: 'new.md', content: 'new', generator: 'fixture@2' }, { path: customPath, content: 'replace', generator: 'fixture@2' }]), { code: 'CTX_ADAPTER_OWNERSHIP_CONFLICT' });
  assert.equal(fs.existsSync(path.join(root, 'new.md')), false);
  apply(root, 'cursor');
  const file = path.join(root, '.cursor/rules/security.mdc');
  fs.appendFileSync(file, '\nUSER CHANGE');
  assert.throws(() => apply(root, 'cursor'), { code: 'CTX_ADAPTER_OWNERSHIP_CONFLICT' });
  assert.ok(fs.readFileSync(file, 'utf8').endsWith('USER CHANGE'));
});

test('Project override affects registry hash, resolver entry and all skill projections', t => {
  const root = fixture(t);
  const compile = () => {
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    return result.registry;
  };
  const before = compile();
  const manager = new SkillCustomizationManager(root);
  const { overridePath } = manager.override('context-os');
  assert.ok(fs.existsSync(path.join(overridePath, 'references/context-rules.md')));
  fs.appendFileSync(path.join(overridePath, 'SKILL.md'), '\nCUSTOM PROJECT GOVERNANCE\n');
  const after = compile();
  assert.notEqual(after.sourceGraphHash, before.sourceGraphHash);
  assert.ok(after.skills['context-os'].source.includes('project/skills'));
  const resolver = new CanonicalResolver({ rootDir: root, registry: after });
  assert.ok(resolver.resolve({ task: 'context-os' }).skills.includes('context-os'));
  const projected = renderAdapters(root, ['gemini', 'claude', 'cursor']).artifacts;
  for (const file of ['.agents/skills/context-os/SKILL.md', '.agents/generated/claude/skills/context-os/SKILL.md', '.cursor/rules/context-os.mdc']) {
    assert.ok(projected.find(art => art.path === file)?.content.toString().includes('CUSTOM PROJECT GOVERNANCE'), file);
  }
});

test('Standalone installed plugins appear in the compiled registry', t => {
  const root = fixture(t);
  fs.cpSync(path.join(__dirname, '../catalog/skills/fastapi'), path.join(root, '.agents/plugins/fastapi'), { recursive: true });
  const result = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  assert.ok(result.registry.skills.fastapi);
});

test('Manifestless project skills hash and resolve the real entrypoint', t => {
  const root = fixture(t);
  const directory = path.join(root, '.agents/project/skills/team-bare');
  fs.mkdirSync(directory, { recursive: true });
  const body = '---\nname: team-bare\ndescription: Team rules\n---\n# Team\nPreserve the public contract.\n';
  fs.writeFileSync(path.join(directory, 'SKILL.md'), body);
  const first = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(first.success, true, JSON.stringify(first.diagnostics));
  const skill = first.registry.skills['team-bare'];
  assert.equal(skill.source, '.agents/project/skills/team-bare/SKILL.md');
  assert.equal(skill.description, 'Team rules');
  assert.equal(skill.entrypointHash, 'sha256:' + createHash('sha256').update(body).digest('hex'));
  assert.equal(skill.estimatedTokens, Math.max(100, Math.ceil(body.length / 3.8)));
  assert.ok(new CanonicalResolver({ rootDir: root, registry: first.registry }).resolve({ task: 'Implement @team-bare' }).skills.includes('team-bare'));
  fs.appendFileSync(path.join(directory, 'SKILL.md'), '\nAdditional team rule.\n');
  assert.notEqual(new ManifestCompiler({ rootDir: root }).compile().registry.sourceGraphHash, first.registry.sourceGraphHash);
});

test('Native and Cursor exports preserve manifestless routing descriptions and track description changes', t => {
  const root = fixture(t);
  const directory = path.join(root, '.agents/project/skills/team-bare');
  fs.mkdirSync(directory, { recursive: true });
  const source = path.join(directory, 'SKILL.md');
  const description = 'Use for auth: session handling, "cookies" --- and authorization.';
  fs.writeFileSync(source, `---\nname: team-bare\ndescription: ${JSON.stringify(description)}\n---\n# Team\nNever log credentials.\n`);
  const yaml = require('../.agents/compiler/vendor/yaml.js');
  const metadata = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)[1]);
  apply(root, 'all');
  assert.equal(new ManifestCompiler({ rootDir: root }).compile().registry.skills['team-bare'].description, description);
  assert.equal(metadata('.agents/skills/team-bare/SKILL.md').description?.trim(), description);
  assert.ok(metadata('.cursor/rules/team-bare.mdc').description.includes('Use for auth: session handling'));
  assert.ok(fs.readFileSync(path.join(root, '.zed/prompts/team-bare.md'), 'utf8').includes(description));
  const changed = 'Use for password reset and account recovery.';
  fs.writeFileSync(source, `---\nname: team-bare\ndescription: >\n  ${changed}\n---\n# Team\nNever log credentials.\n`);
  assert.equal(detectDrift(root, 'all').hasDrift, true);
  apply(root, 'all');
  assert.equal(metadata('.agents/skills/team-bare/SKILL.md').description?.trim(), changed);
  assert.equal(detectDrift(root, 'all').hasDrift, false);
});

for (const manifestFile of ['skill.yaml', 'skill.v2.yaml']) {
  test(`Every adapter uses the custom entrypoint from ${manifestFile}`, t => {
    const root = fixture(t);
    const directory = path.join(root, '.agents/project/skills/team-custom');
    fs.mkdirSync(path.join(directory, 'references'), { recursive: true });
    fs.writeFileSync(path.join(directory, manifestFile), 'schemaVersion: 2\nid: team-custom\nname: team-custom\ndescription: Canonical team rules\ntype: instruction-only\nentrypoint: RULES.md\nresources:\n  - RULES.md\n  - references/details.md\n');
    if (manifestFile === 'skill.v2.yaml') {
      fs.writeFileSync(path.join(directory, 'skill.yaml'), 'id: team-custom\nentrypoint: SKILL.md\n');
    }
    fs.writeFileSync(path.join(directory, 'SKILL.md'), '# Stale\nSTALE_BODY_MARKER\n');
    const canonical = '---\nname: team-custom\ndescription: Entrypoint fallback should not override manifest\n---\n# Team\nCANONICAL_BODY_MARKER\nRead [details](references/details.md).\n';
    fs.writeFileSync(path.join(directory, 'RULES.md'), canonical);
    fs.writeFileSync(path.join(directory, 'references/details.md'), 'SUPPORTING_DETAILS_MARKER\n');
    const compiled = new ManifestCompiler({ rootDir: root }).compileAndWrite();
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    assert.equal(compiled.registry.skills['team-custom'].description, 'Canonical team rules');
    apply(root, 'all');
    assert.ok(fs.readFileSync(path.join(root, '.agents/skills/team-custom/SKILL.md'), 'utf8').includes('Canonical team rules'));
    assert.ok(fs.readFileSync(path.join(root, '.cursor/rules/team-custom.mdc'), 'utf8').includes('Canonical team rules'));
    for (const file of ['.agents/skills/team-custom/SKILL.md', '.agents/generated/claude/skills/team-custom/SKILL.md', '.cursor/rules/team-custom.mdc', '.zed/prompts/team-custom.md']) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(content.includes('CANONICAL_BODY_MARKER'), file);
      assert.equal(content.includes('STALE_BODY_MARKER'), false, file);
    }
    for (const file of ['CONVENTIONS.md', '.github/copilot-instructions.md']) {
      assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes('.agents/project/skills/team-custom/RULES.md'), file);
    }
    assert.equal(detectDrift(root, 'all').hasDrift, false);
    fs.rmSync(path.join(directory, 'SKILL.md'));
    if (manifestFile === 'skill.v2.yaml') fs.rmSync(path.join(directory, 'skill.yaml'));
    const withoutLegacy = new ManifestCompiler({ rootDir: root }).compileAndWrite();
    assert.equal(withoutLegacy.success, true, JSON.stringify(withoutLegacy.diagnostics));
    assert.ok(withoutLegacy.registry.skills['team-custom']);
    apply(root, 'all');
    assert.ok(fs.readFileSync(path.join(root, '.agents/generated/claude/skills/team-custom/SKILL.md'), 'utf8').includes('CANONICAL_BODY_MARKER'));
  });
}

test('Every adapter rejects an entrypoint escaping its skill directory', t => {
  const root = fixture(t);
  const directory = path.join(root, '.agents/project/skills/team-invalid');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'skill.yaml'), 'id: team-invalid\nentrypoint: ../../../../outside.md\n');
  for (const target of ['gemini', 'claude', 'cursor', 'zed', 'aider', 'copilot']) {
    assert.throws(() => renderAdapters(root, target), { code: 'CTX_PATH_OUTSIDE_PROJECT' }, target);
  }
});

test('One fresh all export passes drift and preserves declared supporting resources', t => {
  const root = fixture(t);
  apply(root, 'all');
  const drift = detectDrift(root, 'all');
  assert.equal(drift.hasDrift, false, JSON.stringify(drift));
  const claudeReference = path.join(root, '.agents/generated/claude/skills/context-os/references/context-rules.md');
  const referenceBefore = fs.readFileSync(claudeReference, 'utf8');
  apply(root, 'gemini');
  assert.equal(fs.readFileSync(claudeReference, 'utf8'), referenceBefore, 'Scoped export must not prune another adapter resources');
  for (const prefix of ['.agents/skills', '.agents/generated/gemini/skills', '.agents/generated/claude/skills']) {
    assert.equal(fs.readFileSync(path.join(root, prefix, 'context-os/references/context-rules.md'), 'utf8'), fs.readFileSync(path.join(root, '.agents/core/skills/context-os/references/context-rules.md'), 'utf8'));
  }
  fs.appendFileSync(path.join(root, '.agents/core/skills/security/EXAMPLES.md'), '\nEXAMPLE_ONLY_MARKER\n');
  const rendered = renderAdapters(root, ['gemini', 'claude', 'cursor']).artifacts;
  for (const art of rendered.filter(art => art.path.endsWith('/security/SKILL.md') || art.path.endsWith('/security.mdc'))) {
    assert.equal(art.content.toString().includes('EXAMPLE_ONLY_MARKER'), false, art.path);
  }
  assert.ok(rendered.find(art => art.path === '.agents/skills/security/EXAMPLES.md').content.toString().includes('EXAMPLE_ONLY_MARKER'));
});

test('Soft budget includes foundation skills and reports unavoidable overflow', t => {
  const root = fixture(t);
  const registry = new ManifestCompiler({ rootDir: root }).compile().registry;
  const result = new CanonicalResolver({ rootDir: root, registry }).resolve({ task: 'Review authentication security', contextBudgetTokens: 1000 });
  assert.ok(result.totalEstimatedTokens > 1000);
  assert.equal(result.totalEstimatedTokens, result.selected.reduce((sum, skill) => sum + skill.estimatedTokens, 0));
  assert.ok(result.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'));
});

test('Doctor distinguishes scanner execution errors from secret findings', t => {
  const root = fixture(t);
  const { checkSecretScanner } = require('../.agents/doctor.js');
  fs.mkdirSync(path.join(root, 'scripts'));
  const scanner = path.join(root, 'scripts/check-secrets.js');
  fs.writeFileSync(scanner, 'process.stderr.write("Git repository required"); process.exit(2);');
  const unavailable = checkSecretScanner(root);
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.message, /scanner unavailable/i);
  assert.doesNotMatch(unavailable.message, /potential secrets/);
  fs.writeFileSync(scanner, 'process.exit(1);');
  assert.match(checkSecretScanner(root).message, /potential secrets/);
});
