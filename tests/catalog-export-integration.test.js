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
const { renderAdapters, applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');

test('F13 catalog adapter paths and activation contracts agree with actual rendered delivery', t => {
  const YAML = require('yaml');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-catalog-adapter-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.resolve(__dirname, '../catalog/skills/adapters');
  const installed = path.join(root, '.agents/project/skills/adapters');
  fs.cpSync(source, installed, { recursive: true });
  const skill = fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8');
  const examples = fs.readFileSync(path.join(source, 'EXAMPLES.md'), 'utf8');
  const manifest = YAML.parse(fs.readFileSync(path.join(installed, 'skill.yaml'), 'utf8'));
  const targets = { 'Gemini / Antigravity': 'gemini', 'Claude Code': 'claude', 'GitHub Copilot': 'copilot', Cursor: 'cursor', Aider: 'aider', 'Zed IDE': 'zed' };
  const declared = [...skill.matchAll(/^\| \*\*([^*]+)\*\* \| ([^|]+) \|/gm)];
  assert.equal(declared.length, Object.keys(targets).length);
  const rendered = renderAdapters(root, 'all');
  const matchesPath = (pattern, artifact) => {
    const expanded = pattern.replace(/<skill>/g, 'adapters');
    return expanded.endsWith('/') ? artifact.path.startsWith(expanded) : artifact.path === expanded;
  };
  for (const [, agent, paths] of declared) {
    const target = targets[agent];
    assert.ok(target, agent);
    for (const [, output] of paths.matchAll(/`([^`]+)`/g)) {
      assert.ok(rendered.artifacts.some(art => art.generator === `${target}@2` && matchesPath(output, art)), `${agent} documents nonexistent output ${output}`);
    }
  }
  const compiled = new ManifestCompiler({ rootDir: root }).compileAndWrite();
  assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
  const exampleOutputs = examples.match(/```text\r?\n([\s\S]*?)```/)[1].trim().split(/\r?\n/);
  for (const output of exampleOutputs) {
    assert.ok(rendered.artifacts.some(art => art.path === output), `Example output is not generated: ${output}`);
  }
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  assert.equal(detectDrift(root, 'all').hasDrift, false);
  const native = fs.readFileSync(path.join(root, '.claude/skills/adapters/SKILL.md'), 'utf8');
  assert.ok(native.includes('.claude/skills/<skill>/SKILL.md'), 'installed native body must carry the current contract');
  assert.equal(fs.readFileSync(path.join(root, '.claude/skills/adapters/EXAMPLES.md'), 'utf8').replace(/\r\n/g, '\n'), examples.replace(/\r\n/g, '\n'));

  const cli = path.resolve(__dirname, '../bin/index.js');
  const commands = examples.match(/```sh\r?\n([\s\S]*?)```/)[1].split(/\r?\n/).filter(line => line.startsWith('contextos '));
  assert.deepEqual(commands, ['contextos compile', 'contextos export all', 'contextos export all --check --json']);
  for (const command of commands) {
    const stdout = require('child_process').execFileSync(process.execPath, [cli, ...command.split(' ').slice(1)], { cwd: root, encoding: 'utf8' });
    if (command.endsWith('--json')) assert.equal(JSON.parse(stdout).hasDrift, false);
  }

  const activationRows = [...skill.matchAll(/^\| `(gemini|claude|cursor)` \| `(auto|always|globs)` \| ([^|]+) \|/gm)];
  assert.equal(activationRows.length, 9, 'document all three activation modes for each native activation adapter');
  const frontmatter = art => YAML.parse(art.content.toString('utf8').match(/^---\n([\s\S]*?)\n---/)[1]);
  for (const mode of ['auto', 'always', 'globs']) {
    fs.writeFileSync(path.join(installed, 'skill.yaml'), YAML.stringify({ ...manifest, activation: mode, globs: ['src/**/*.ts'] }));
    const result = renderAdapters(root, 'all');
    for (const [, target, activation, paths] of activationRows.filter(row => row[2] === mode)) {
      for (const [, output] of paths.matchAll(/`([^`]+)`/g)) {
        assert.ok(result.artifacts.some(art => art.generator === `${target}@2` && matchesPath(output, art)), `${target}/${activation}: ${output}`);
      }
    }
    const byPath = new Map(result.artifacts.map(art => [art.path, art]));
    const claudeRule = byPath.get('.claude/rules/adapters.md');
    assert.equal(Boolean(claudeRule), mode !== 'auto');
    assert.equal(byPath.has('.claude/skills/adapters/SKILL.md'), mode === 'auto');
    if (mode === 'globs') assert.deepEqual(frontmatter(claudeRule).paths, ['src/**/*.ts']);
    if (mode === 'always') assert.ok(!claudeRule.content.toString('utf8').startsWith('---'));
    const geminiRule = byPath.get('.agents/rules/contextos-adapters.md');
    assert.equal(Boolean(geminiRule), mode !== 'auto');
    if (geminiRule) assert.equal(frontmatter(geminiRule).trigger, mode === 'always' ? 'always_on' : 'glob');
    const cursor = frontmatter(byPath.get('.cursor/rules/adapters.mdc'));
    assert.equal(cursor.alwaysApply, mode === 'always');
    assert.equal(cursor.globs, mode === 'globs' ? 'src/**/*.ts' : '');
    for (const output of ['.github/copilot-instructions.md', 'CONVENTIONS.md', '.zed/rules.md']) {
      assert.equal(byPath.get(output).content.toString('utf8').includes('## Supported Agents'), mode === 'always', `${output} inlines only always bodies`);
    }
    assert.equal(byPath.has('CLAUDE.md'), false);
    assert.equal(byPath.has('.cursorrules'), false);
  }

  const exampleManifest = YAML.parse(examples.match(/```yaml\r?\n([\s\S]*?)```/)[1]);
  const exampleDir = path.join(root, '.agents/project/skills', exampleManifest.id);
  fs.mkdirSync(exampleDir, { recursive: true });
  fs.writeFileSync(path.join(exampleDir, 'skill.yaml'), YAML.stringify(exampleManifest));
  fs.writeFileSync(path.join(exampleDir, exampleManifest.entrypoint), '# Team policy body\n');
  const scoped = renderAdapters(root, 'all');
  for (const output of ['.claude/rules/team-policy.md', '.cursor/rules/team-policy.mdc', '.agents/rules/contextos-team-policy.md']) {
    assert.ok(examples.includes(`\`${output}\``));
    assert.ok(scoped.artifacts.some(art => art.path === output), `Scoped example path exists: ${output}`);
  }
  const scopedByPath = new Map(scoped.artifacts.map(art => [art.path, art]));
  assert.deepEqual(frontmatter(scopedByPath.get('.claude/rules/team-policy.md')).paths, exampleManifest.globs);
  assert.equal(frontmatter(scopedByPath.get('.cursor/rules/team-policy.mdc')).globs, exampleManifest.globs.join(','));
  assert.equal(frontmatter(scopedByPath.get('.cursor/rules/team-policy.mdc')).alwaysApply, false);
  assert.equal(frontmatter(scopedByPath.get('.agents/rules/contextos-team-policy.md')).trigger, 'glob');
});

test('the entire catalog compiles alongside the legacy React performance alias', t => {
  const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-complete-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.resolve(__dirname, '../.agents/core/skills'), path.join(root, '.agents/core/skills'), { recursive: true });
  fs.cpSync(path.resolve(__dirname, '../catalog/skills'), path.join(root, '.agents/plugins'), { recursive: true });
  const compiled = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
  assert.equal(Object.keys(compiled.registry.skills).length,
    fs.readdirSync(path.resolve(__dirname, '../.agents/core/skills')).length + fs.readdirSync(path.resolve(__dirname, '../catalog/skills')).length);
  const resolver = new CanonicalResolver({ rootDir: root, registry: compiled.registry });
  assert.ok(resolver.resolve({ explicitSkills: ['vercel-react-best-practices'], installedOnly: true }).skills.includes('vercel-react-best-practices'));
  const legacy = resolver.resolve({ explicitSkills: ['react-best-practices'], installedOnly: true });
  assert.ok(legacy.skills.includes('react'));
  assert.ok(!legacy.skills.includes('vercel-react-best-practices'));
  const rendered = renderAdapters(root, 'all');
  assert.deepEqual(rendered.collisions, []);
  assert.equal(new Set(rendered.artifacts.map(artifact => artifact.generator)).size, 6);
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  assert.equal(detectDrift(root, 'all').hasDrift, false);
  for (const base of ['.agents/core/skills', 'catalog/skills']) {
    for (const id of fs.readdirSync(path.resolve(__dirname, '..', base))) {
      const source = path.resolve(__dirname, '..', base, id);
      const manifest = require('yaml').parse(fs.readFileSync(path.join(source, 'skill.yaml'), 'utf8'));
      for (const resource of manifest.resources) {
        const name = typeof resource === 'string' ? resource : resource.path;
        const nativeRoots = ['.agents/skills'];
        if (require('../.agents/adapters/shared.js').resolveActivation(source).mode === 'auto') nativeRoots.push('.claude/skills');
        for (const native of nativeRoots) {
          assert.ok(fs.existsSync(path.join(root, native, id, name)), `${native}/${id}/${name}`);
          if (!name.endsWith('.md') || name !== 'SKILL.md') {
            assert.equal(fs.readFileSync(path.join(root, native, id, name), 'utf8').replace(/\r\n/g, '\n'),
              fs.readFileSync(path.join(source, name), 'utf8').replace(/\r\n/g, '\n'));
          }
        }
      }
    }
  }
});

test('frontend preset installs, resolves and exports the focused catalog skills with their real resources', t => {
  const { execFileSync } = require('node:child_process');
  const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-frontend-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, '../bin/index.js');
  execFileSync(process.execPath, [cli, 'init', '--with-core', '--preset', 'frontend', '--skip-compile'], {
    cwd: root, encoding: 'utf8', timeout: 60000,
  });
  const compiled = new ManifestCompiler({ rootDir: root }).compileAndWrite();
  assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
  const resolver = new CanonicalResolver({ rootDir: root, registry: compiled.registry });
  const cases = [
    ['frontend-design', 'Improve typography and composition', 'Улучши типографику'],
    ['vercel-react-best-practices', 'Improve React performance', 'Нужна оптимизация React'],
    ['web-design-guidelines', 'Perform a UI review', 'Сделай аудит интерфейса'],
    ['animate', 'Animate the disclosure transition', 'Добавь анимацию'],
    ['animation-performance', 'Investigate animation stutter', 'Исправь рывки анимации'],
    ['review-animations', 'Review animations in the drawer', 'Проверь анимации'],
    ['pick-ui-library', 'Choose UI library for the dialog', 'Подбери библиотеку'],
    ['webapp-testing', 'Write a browser test in Playwright', 'Нужна проверка в браузере'],
  ];
  for (const [id, ...tasks] of cases) {
    assert.ok(compiled.registry.skills[id], id);
    assert.equal(compiled.registry.skills[id].deprecated, false, id);
    const explicit = resolver.resolve({ explicitSkills: [id], installedOnly: true });
    assert.ok(explicit.skills.includes(id), `explicit ${id}`);
    for (const task of tasks) {
      const result = resolver.resolve({ task, installedOnly: true });
      assert.ok(result.skills.includes(id), `${task}: ${JSON.stringify(result.skills)}`);
    }
  }
  const backend = resolver.resolve({ task: 'Add a database index', installedOnly: true });
  assert.ok(cases.every(([id]) => !backend.skills.includes(id)), 'frontend rules do not activate for an unrelated backend task');
  const rendered = renderAdapters(root, 'all');
  assert.deepEqual(rendered.collisions, []);
  assert.equal(new Set(rendered.artifacts.map(artifact => artifact.generator)).size, 6);
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  assert.equal(detectDrift(root, 'all').hasDrift, false);
  for (const [id] of cases) {
    const source = path.join(root, '.agents/plugins', id);
    const manifest = require('yaml').parse(fs.readFileSync(path.join(source, 'skill.yaml'), 'utf8'));
    for (const resource of manifest.resources) {
      const relative = typeof resource === 'string' ? resource : resource.path;
      const expected = fs.readFileSync(path.join(source, relative));
      if (!relative.endsWith('.md')) {
        assert.deepEqual(fs.readFileSync(path.join(root, '.claude/skills', id, relative)), expected, `${id}/${relative}`);
        assert.deepEqual(fs.readFileSync(path.join(root, '.agents/skills', id, relative)), expected, `${id}/${relative}`);
      } else {
        assert.ok(fs.existsSync(path.join(root, '.claude/skills', id, relative)), `${id}/${relative}`);
      }
    }
  }
  const resource = path.join(root, '.agents/plugins/webapp-testing/references/playwright.md');
  fs.appendFileSync(resource, '\nA changed local browser-testing policy.\n');
  assert.equal(detectDrift(root, 'all').hasDrift, true);
  const updated = renderAdapters(root, 'all');
  applyArtifacts(root, updated.artifacts, { context: updated.context });
  assert.equal(detectDrift(root, 'all').hasDrift, false);
});

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
      artifactPaths.some((p) => p.includes('.claude/rules/web-accessibility.md')),
      'Claude adapter must compile web-accessibility SKILL.md'
    );
  });

  // Original-source syntax and behavior run in skill-examples.test.js and
  // skill-catalog-quality.test.js. Presence of a library name proves no behavior.
});
