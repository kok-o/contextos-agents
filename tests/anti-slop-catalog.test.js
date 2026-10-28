'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
const { renderAdapters, applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');
const ROOT = path.resolve(__dirname, '..');

test('anti-slop catalog entries select only relevant work and preserve resources through six exports', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-antislop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ids = ['humanizer', 'kill-ai-slop'];
  const registry = require('../registry.json');
  for (const id of ids) {
    const entry = registry.skills.find(s => s.name === id);
    assert.ok(entry, id);
    const source = path.join(ROOT, entry.path);
    // Install exactly the declared public payload, as a registry consumer does.
    const installed = path.join(root, '.agents/plugins', id);
    for (const relative of entry.resources) {
      const dest = path.join(installed, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(source, relative), dest);
    }
  }
  const compiled = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
  const resolver = new CanonicalResolver({ rootDir: root, registry: compiled.registry });
  const cases = [
    ['humanizer', 'Humanize text in this draft', 'Очеловечь текст письма'],
    ['kill-ai-slop', 'Remove the AI look from this page', 'Убери шаблонность интерфейса'],
  ];
  for (const [id, ...tasks] of cases) {
    assert.deepEqual(resolver.resolve({ explicitSkills: [id], installedOnly: true }).skills, [id]);
    for (const task of tasks) {
      const result = resolver.resolve({ task, installedOnly: true });
      assert.ok(result.skills.includes(id), task + ': ' + JSON.stringify(result.skills));
    }
  }
  for (const task of ['Add a database index', 'Исправь миграцию базы данных']) {
    const result = resolver.resolve({ task, files: ['src/db.ts'], installedOnly: true });
    assert.ok(ids.every(id => !result.skills.includes(id)), JSON.stringify(result.skills));
  }
  const rendered = renderAdapters(root, 'all');
  assert.deepEqual(rendered.collisions, []);
  assert.equal(new Set(rendered.artifacts.map(a => a.generator)).size, 6);
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  assert.equal(detectDrift(root, 'all').hasDrift, false);
  for (const id of ids) {
    const source = path.join(ROOT, 'catalog/skills', id);
    const manifest = YAML.parse(fs.readFileSync(path.join(source, 'skill.yaml'), 'utf8'));
    for (const base of ['.agents/skills', '.claude/skills']) {
      for (const resource of manifest.resources) {
        const target = path.join(root, base, id, resource);
        assert.ok(fs.existsSync(target), target);
        if (!resource.endsWith('.md')) {
          assert.deepEqual(fs.readFileSync(target), fs.readFileSync(path.join(source, resource)));
        }
      }
    }
  }
});
