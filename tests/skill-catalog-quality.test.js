'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { loadNamedExample } = require('../scripts/skill-example-loader.cjs');
const ROOT = path.resolve(__dirname, '..');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-skill-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ctx-skill-quality-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function tool(name, args = []) {
  return spawnSync(process.execPath, [path.join(ROOT, 'catalog/skills/vercel-optimize/scripts', name), ...args], {
    encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
}
function write(root, name, value) {
  const file = path.join(root, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}
test('Vercel collector cannot present fabricated production telemetry without explicit demo mode', () => {
  const result = tool('collect-signals.mjs');
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  const demo = tool('collect-signals.mjs', ['--demo']);
  assert.equal(demo.status, 0, demo.stderr);
  const data = JSON.parse(demo.stdout);
  assert.equal(data.synthetic, true);
  assert.equal(data.telemetrySource, 'synthetic-demo');
});
test('Vercel collector imports supplied metrics without inventing values or exporting extra credentials', t => {
  const root = fixture(t);
  const input = write(root, 'observed.json', { projectId: 'project-fixture', windowDays: 7,
    metrics: { totalInvocations: 12345 }, accessToken: 'not-exported', routes: [] });
  const result = tool('collect-signals.mjs', ['--input', input]);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.projectId, 'project-fixture');
  assert.equal(data.metrics.totalInvocations, 12345);
  assert.equal(data.metrics.p95DurationMs, undefined, 'missing observations stay missing');
  assert.equal(data.synthetic, false);
  assert.equal(data.telemetrySource, 'provided-json');
  assert.equal(data.accessToken, undefined);
  assert.notEqual(tool('collect-signals.mjs', ['another-project', '--input', input]).status, 0, 'project scope mismatch is rejected');
  assert.notEqual(tool('collect-signals.mjs', ['--demo', '--window', '-1']).status, 0);
  const invalid = write(root, 'invalid.json', { projectId: 'project-fixture', metrics: { totalInvocations: -1 }, routes: [] });
  assert.notEqual(tool('collect-signals.mjs', ['--input', invalid]).status, 0);
});
test('Vercel gates reject synthetic evidence by default and preserve its identity through merge', t => {
  const root = fixture(t);
  const demo = JSON.parse(tool('collect-signals.mjs', ['--demo']).stdout);
  const source = write(root, 'demo.json', demo);
  const code = write(root, 'code.json', { framework: 'nextjs', routes: [{ route: '/unobserved', file: 'app/unobserved/page.tsx' }] });
  const merged = tool('merge-signals.mjs', [source, code]);
  assert.equal(merged.status, 0, merged.stderr);
  const data = JSON.parse(merged.stdout);
  assert.equal(data.synthetic, true);
  assert.equal(data.telemetrySource, 'synthetic-demo');
  assert.equal(data.routes.find(route => route.route === '/unobserved').invocations, null);
  const mergedFile = write(root, 'merged.json', data);
  assert.notEqual(tool('gate-investigations.mjs', [mergedFile]).status, 0);
  const allowed = tool('gate-investigations.mjs', [mergedFile, '--allow-demo']);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(JSON.parse(allowed.stdout).synthetic, true);
});
test('Vercel cache candidates require affirmative public eligibility and exclude private or already cached routes', t => {
  const root = fixture(t);
  const base = { method: 'GET', invocations: 200000, p95DurationMs: 50, coldStartRate: 0 };
  const input = write(root, 'signals.json', { projectId: 'p', telemetrySource: 'provided-json', synthetic: false, routes: [
    { ...base, route: '/private', cacheable: false, currentCacheControl: 'no-store' },
    { ...base, route: '/personalized', cacheable: true, currentCacheControl: 'private, no-cache' },
    { ...base, route: '/unknown', currentCacheControl: 'no-store' },
    { ...base, route: '/cached', cacheable: true, currentCacheControl: 'public, s-maxage=600' },
    { ...base, route: '/public', cacheable: true, currentCacheControl: 'no-store' },
    { ...base, route: '/.well-known/workflow/v1/run', p95DurationMs: 5000, cacheable: false },
  ] });
  const result = tool('gate-investigations.mjs', [input]);
  assert.equal(result.status, 0, result.stderr);
  const candidates = JSON.parse(result.stdout).candidates;
  assert.deepEqual(candidates.filter(c => c.category === 'caching').map(c => c.route), ['/public']);
  assert.ok(!candidates.some(c => c.category === 'compute-duration' && c.route.includes('/workflow/v1/')));
});
test('security audit source example rejects sibling prefixes, traversal and outside links', t => {
  const root = fixture(t);
  const base = path.join(root, 'allowed');
  const outside = path.join(root, 'allowed-other');
  fs.mkdirSync(base); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(base, 'safe.txt'), 'allowed');
  fs.writeFileSync(path.join(outside, 'private.txt'), 'outside');
  const source = path.join(ROOT, 'catalog/skills/security-audit/EXAMPLES.md');
  const { resolveExistingFile } = loadNamedExample(source, 'security-audit-contained-file');
  assert.equal(resolveExistingFile(base, 'safe.txt', fs, path), fs.realpathSync(path.join(base, 'safe.txt')));
  assert.throws(() => resolveExistingFile(base, '../allowed-other/private.txt', fs, path), /outside|escape/i);
  assert.throws(() => resolveExistingFile(base, outside, fs, path), /relative/i);
  assert.throws(() => resolveExistingFile(base, '.', fs, path));
  assert.throws(() => resolveExistingFile(base, '', fs, path));
  fs.symlinkSync(outside, path.join(base, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => resolveExistingFile(base, 'escape/private.txt', fs, path), /outside|escape/i);
});

test('telemetry helper failures do not echo malformed input content', t => {
  const root = fixture(t);
  const broken = path.join(root, 'broken.json');
  fs.writeFileSync(broken, '{"accessToken": "private-fixture-marker"');
  const code = write(root, 'code.json', { routes: [] });
  for (const [script, args] of [
    ['collect-signals.mjs', ['--input', broken]],
    ['merge-signals.mjs', [broken, code]],
    ['gate-investigations.mjs', [broken]],
  ]) {
    const result = tool(script, args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('private-fixture-marker'), script);
  }
});

test('all reviewed skills have complete inventory metadata and canonical public descriptions', () => {
  const YAML = require('yaml');
  const inventory = require('../docs/product/skill-inventory.json');
  const installed = ['.agents/core/skills', 'catalog/skills'].flatMap(base => fs.readdirSync(path.join(ROOT, base))
    .filter(name => fs.statSync(path.join(ROOT, base, name)).isDirectory()).map(name => base + '/' + name));
  assert.deepEqual(inventory.entries.map(entry => entry.path).sort(), installed.sort());
  assert.equal(new Set(inventory.entries.map(entry => entry.id)).size, installed.length);
  for (const entry of inventory.entries) {
    assert.ok(entry.responsibility && entry.reason && entry.checks.length, entry.id);
    const text = fs.readFileSync(path.join(ROOT, entry.path, 'SKILL.md'), 'utf8');
    const fm = YAML.parse(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
    assert.equal(fm.name, entry.id, entry.id);
  }
  for (const relative of ['registry.json', '.agents/skills-index.json']) {
    const entries = JSON.parse(fs.readFileSync(path.join(ROOT, relative))).skills;
    for (const entry of entries) {
      const file = path.join(ROOT, entry.path.endsWith('.md') ? entry.path : entry.path + '/SKILL.md');
      const fm = YAML.parse(fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
      assert.equal(entry.description, fm.description.trim(), relative + ': ' + entry.name);
    }
  }
});

test('non-alias catalog skills compile on their own without unrelated instruction dependencies', t => {
  const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
  const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
  const YAML = require('yaml');
  const root = fixture(t);
  for (const id of fs.readdirSync(path.join(ROOT, 'catalog/skills'))) {
    const source = path.join(ROOT, 'catalog/skills', id);
    const manifest = YAML.parse(fs.readFileSync(path.join(source, 'skill.yaml'), 'utf8'));
    if (manifest.deprecated) continue;
    const project = path.join(root, id);
    fs.cpSync(source, path.join(project, '.agents/project/skills', id), { recursive: true });
    const compiled = new ManifestCompiler({ rootDir: project }).compile();
    assert.equal(compiled.success, true, id + ': ' + JSON.stringify(compiled.diagnostics));
    const result = new CanonicalResolver({ rootDir: project, registry: compiled.registry }).resolve({ explicitSkills: [id], installedOnly: true });
    assert.deepEqual(result.skills, [id], id + ': standalone instruction skill should not force an unrelated body');
  }
});

test('generic Python project files do not imply a FastAPI application', t => {
  const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
  const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
  const root = fixture(t);
  fs.cpSync(path.join(ROOT, 'catalog/skills/fastapi'), path.join(root, '.agents/project/skills/fastapi'), { recursive: true });
  fs.writeFileSync(path.join(root, 'requirements.txt'), 'numpy>=2\n');
  fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname = "data-tool"\n');
  const compiled = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(compiled.success, true);
  const resolver = new CanonicalResolver({ rootDir: root, registry: compiled.registry });
  for (const task of ['Read a CSV with Python', 'Исправь скрипт на питоне']) {
    const result = resolver.resolve({ task, files: ['main.py', 'requirements.txt', 'pyproject.toml'], installedOnly: true });
    assert.ok(!result.skills.includes('fastapi'), task + ': ' + JSON.stringify(result.skills));
  }
  assert.ok(resolver.resolve({ task: 'Fix the FastAPI endpoint', files: ['main.py'], installedOnly: true }).skills.includes('fastapi'));
});
