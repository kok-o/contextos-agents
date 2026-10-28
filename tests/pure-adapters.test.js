/**
 * tests/pure-adapters.test.js
 * Test suite for Pure Adapter Contract, Provenance Headers & Drift Detection (Milestone 7)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

const {
  renderAdapters,
  listAdapters,
  getAdapter,
  createProvenanceHeader,
  applyArtifacts,
} = require('../.agents/adapters/pure-compiler.js');
const { detectDrift, computeDiffSnippet, DRIFT_STATES } = require('../.agents/adapters/drift-detector.js');

it('CR05 adapter exclusions use canonical manifest identity without renaming directory outputs', t => {
  const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
  const { collectSkillDirectories } = require('../.agents/adapters/shared.js');
  for (const [manifest, winner, canonicalId] of [
    [{ id: 'alpha', name: 'legacy' }, null, 'alpha'],
    [{ name: 'alpha' }, null, 'alpha'],
    [{}, null, 'policy'],
    [{ id: 'stale' }, { schemaVersion: 2, id: 'alpha' }, 'alpha'],
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-canonical-exclusion-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/project/skills/policy');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'skill.yaml'), JSON.stringify(manifest));
    if (winner) fs.writeFileSync(path.join(dir, 'skill.v2.yaml'), JSON.stringify(winner));
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# ALPHA_PRIVATE_POLICY\n');
    const compiled = new ManifestCompiler({ rootDir: root }).compile();
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    assert.ok(compiled.registry.skills[canonicalId]);
    fs.writeFileSync(path.join(root, '.agents/profile.json'), JSON.stringify({ profile: 'custom', exclude_skills: [canonicalId] }));
    assert.deepEqual(collectSkillDirectories(null, root), [], canonicalId);
    const excluded = renderAdapters(root, 'all');
    assert.ok(!excluded.artifacts.some(art => art.content.includes('ALPHA_PRIVATE_POLICY')));
    assert.ok(!excluded.artifacts.some(art => art.sourceSkillIds.includes('policy')));
    if (canonicalId !== 'policy') {
      fs.writeFileSync(path.join(root, '.agents/profile.json'), JSON.stringify({ profile: 'custom', exclude_skills: ['policy'] }));
      const included = renderAdapters(root, 'cursor');
      assert.ok(included.artifacts.some(art => art.path === '.cursor/rules/policy.mdc'), 'directory names remain output identities, not exclusion aliases');
    }
  }
});

for (const [label, manifest, pointer] of [
  ['string requires', { id: 'alpha', dependencies: { requires: 'missing-prerequisite' } }, '/dependencies/requires'],
  ['numeric keyword', { id: 'alpha', signals: { keywords: [{ value: 42, weight: 40 }] } }, '/signals/keywords/0/value'],
  ['false nested dependencies', { id: 'alpha', dependencies: false }, '/dependencies'],
  ['null nested context', { id: 'alpha', context: null }, '/context'],
  ['unknown nested field', { id: 'alpha', signals: { surprise: true } }, '/signals/surprise'],
  ['false root', false, '/'], ['zero root', 0, '/'], ['null root', null, '/'],
  ['array root', [], '/'], ['string root', 'not-a-manifest', '/'],
]) {
  it(`CR06 raw manifest validation rejects ${label} before export/apply/check success`, t => {
    const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
    const { readSkillManifest } = require('../.agents/adapters/shared.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-raw-export-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/project/skills/policy');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Policy\n');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), '{"id":"alpha"}');
    const valid = renderAdapters(root, 'all');
    applyArtifacts(root, valid.artifacts, { context: valid.context });
    const paths = [...valid.artifacts.map(art => art.path), '.agents/lockfile.v2.json'];
    const before = paths.map(file => fs.readFileSync(path.join(root, file)));
    for (const filename of ['skill.yaml', 'skill.v2.yaml']) {
      fs.writeFileSync(path.join(dir, 'skill.yaml'), '{"id":"alpha"}');
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(manifest));
      assert.equal(new ManifestCompiler({ rootDir: root }).compile().success, false, filename);
      const invalid = err => {
        assert.equal(err.code, 'CTX_ADAPTER_INVALID_MANIFEST');
        assert.equal(err.path, pointer === '/' ? '' : pointer);
        assert.equal(err.file, path.join(dir, filename));
        assert.ok(err.message.includes(`${pointer}:`), err.message);
        return true;
      };
      assert.throws(() => readSkillManifest(dir), invalid);
      for (const adapter of listAdapters()) {
        assert.throws(() => renderAdapters(root, adapter), invalid, adapter);
        assert.throws(() => getAdapter(adapter).run({ projectRoot: root }), invalid, adapter);
        const checked = detectDrift(root, adapter);
        assert.equal(checked.status, 'error', adapter);
        assert.equal(checked.code, 2, adapter);
        assert.equal(checked.hasError, true, adapter);
        assert.ok(checked.findings.CONFIG_ERROR.some(finding => finding.reason.includes(`${pointer}:`)));
      }
      paths.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, file)), before[i], file));
    }
  });
}

it('CR06 validates only the winning v2 manifest with no external runtime dependencies', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-raw-export-vendor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/policy');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# WINNING_POLICY\n');
  fs.writeFileSync(path.join(dir, 'skill.yaml'), 'false');
  fs.writeFileSync(path.join(dir, 'skill.v2.yaml'), 'schemaVersion: 2\nid: alpha\n');
  const compiler = path.resolve(__dirname, '../.agents/adapters/pure-compiler.js');
  const reader = path.resolve(__dirname, '../.agents/adapters/shared.js');
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const Module = require('module'), load = Module._load;
    Module._load = function(id, ...args) {
      if (/^(yaml|ajv|ajv-formats)(\\/|$)/.test(id)) throw new Error('external devDependency unavailable: ' + id);
      return load.call(this, id, ...args);
    };
    const { renderAdapters } = require(${JSON.stringify(compiler)});
    assert.ok(renderAdapters(${JSON.stringify(root)}, 'all').artifacts.some(art => art.content.includes('WINNING_POLICY')));
    require('fs').writeFileSync(${JSON.stringify(path.join(dir, 'skill.v2.yaml'))}, 'false');
    assert.throws(() => require(${JSON.stringify(reader)}).readSkillManifest(${JSON.stringify(dir)}), { code: 'CTX_ADAPTER_INVALID_MANIFEST' });
  `]);
});

it('CR07 Cursor project-rule links resolve from the actual destination and preserve fenced examples', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-cursor-project-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.agents/docs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/docs/team policy.md'), '# Policy\n');
  fs.writeFileSync(path.join(root, '.agents/AGENTS.md'), '# Project rules\n[Policy](docs/team%20policy.md#policy)\n[Reference][team]\n\n[team]: docs/team%20policy.md#policy\n\n```md\n[Literal](leave.md)\n```\n\n~~~md\n[literal]: unchanged.md\n~~~\n[Web](https://example.com/policy)\n[Anchor](#local)\n');
  const rendered = renderAdapters(root, 'cursor');
  const output = rendered.artifacts.find(art => art.path === '.cursor/rules/00-project-rules.mdc');
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  const text = fs.readFileSync(path.join(root, output.path), 'utf8');
  const href = text.match(/\[Policy\]\(([^)]+)\)/)[1];
  assert.ok(href.endsWith('#policy'));
  assert.equal(fs.readFileSync(path.resolve(root, path.dirname(output.path), decodeURIComponent(href.split('#')[0])), 'utf8'), '# Policy\n');
  assert.ok(text.includes(`[team]: ${href}`));
  assert.ok(text.includes('```md\n[Literal](leave.md)\n```'));
  assert.ok(text.includes('~~~md\n[literal]: unchanged.md\n~~~'));
  assert.ok(text.includes('[Web](https://example.com/policy)'));
  assert.ok(text.includes('[Anchor](#local)'));
  assert.equal(detectDrift(root, 'cursor').hasDrift, false);
});

it('F10 Copilot exports project rules with usable links and detects source changes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-copilot-project-rules-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.agents/docs'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github'));
  fs.writeFileSync(path.join(root, '.github/copilot-instructions.md'), '# User instructions\nKeep me.\n');
  fs.writeFileSync(path.join(root, '.agents/docs/team policy.md'), '# Policy\n');
  const source = path.join(root, '.agents/AGENTS.md');
  fs.writeFileSync(source, '# Project rules\nCOPILOT_POLICY_V1\n[Policy](docs/team%20policy.md#policy)\n[Reference][team]\n\n[team]: docs/team%20policy.md#policy\n\n```md\n[Literal](leave.md)\n```\n');
  const rendered = renderAdapters(root, 'copilot');
  const output = rendered.artifacts.find(art => art.path === '.github/copilot-instructions.md');
  const text = output.content.toString('utf8');
  assert.match(text, /COPILOT_POLICY_V1/);
  assert.match(text, /# User instructions\nKeep me\./);
  assert.match(text, /\[Literal\]\(leave\.md\)/);
  const href = text.match(/\[Policy\]\(([^)]+)\)/)[1];
  assert.equal(fs.readFileSync(path.resolve(root, '.github', decodeURIComponent(href.split('#')[0])), 'utf8'), '# Policy\n');
  assert.ok(text.includes(`[team]: ${href}`));
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  assert.equal(detectDrift(root, 'copilot').hasDrift, false);
  fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace('COPILOT_POLICY_V1', 'COPILOT_POLICY_V2'));
  const report = detectDrift(root, 'copilot');
  assert.equal(report.code, 1);
  assert.ok(report.findings.STALE_INPUT.some(finding => finding.path === output.path));
  const updated = renderAdapters(root, 'copilot');
  applyArtifacts(root, updated.artifacts, { context: updated.context });
  assert.match(fs.readFileSync(path.join(root, output.path), 'utf8'), /COPILOT_POLICY_V2/);
  assert.equal(detectDrift(root, 'copilot').hasDrift, false);
});

it('F11 Cursor frontmatter round-trips YAML strings using the installed parser', t => {
  const YAML = require('yaml');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-cursor-yaml-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Team policy\n');
  const title = 'Team "quoted" policy';
  const descriptions = [
    'Release policy C:\\policies\\release',
    'Preserve "double" and \'single\' quotes: # not a comment',
    'First line\nSecond line\r\nThird line\tTabbed',
    'Control \u0000 \u0001 \u0007 \u000b \u001b \u007f \u0085 \u2028 \u2029 emoji \ud83d\udd12',
    'true', 'null', '[array]', '{object}', '---\nfrontmatter-like',
  ];
  for (const activation of ['auto', 'always', 'globs']) {
    for (const description of descriptions) {
      const globs = ['src/\\[literal\\]/**/*.ts', 'src/with\ttab/*.js', 'src/"quoted"/*.ts', "src/with'apostrophe/*.js", 'src/control\u0001/*.js'];
      fs.writeFileSync(path.join(dir, 'skill.yaml'), YAML.stringify({ id: 'team', displayName: title, description, activation, globs }));
      const rendered = renderAdapters(root, 'cursor');
      const content = rendered.artifacts.find(art => art.path === '.cursor/rules/team.mdc').content.toString('utf8');
      const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)[1];
      const parsed = YAML.parse(frontmatter);
      assert.equal(parsed.description, activation === 'auto' ? `Agent-requested: invoke when working on ${title}. ${description}` : description);
      assert.equal(parsed.globs, activation === 'globs' ? globs.join(',') : '');
      assert.equal(parsed.alwaysApply, activation === 'always');
    }
  }
  // Runtime serialization must use the shipped vendor, not a devDependency.
  const compiler = path.resolve(__dirname, '../.agents/adapters/pure-compiler.js');
  execFileSync(process.execPath, ['-e', `const Module = require('module'); const load = Module._load; Module._load = function(id, ...args) { if (id === 'yaml') throw new Error('devDependency unavailable'); return load.call(this, id, ...args); }; require(${JSON.stringify(compiler)}).renderAdapters(${JSON.stringify(root)}, 'cursor');`]);
});

it('F12 binary resources use exact bytes for rendering, drift and protected apply', t => {
  const { computeExactHash } = require('../.agents/filesystem/index.js');
  for (const [original, edited] of [
    [Buffer.from('ff0041', 'hex'), Buffer.from('fe0041', 'hex')],
    [Buffer.from('A\r\nB'), Buffer.from('A\nB')],
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-binary-resource-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/project/skills/team');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Team policy\n');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), 'id: team\nresources: [data.bin, notes.txt]\n');
    fs.writeFileSync(path.join(dir, 'data.bin'), original);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'Notes\nSecond line\n');
    const rendered = renderAdapters(root, ['gemini', 'claude']);
    const binaries = rendered.artifacts.filter(art => art.path.endsWith('/data.bin'));
    assert.equal(binaries.length, 3);
    for (const art of binaries) assert.deepEqual(art.content, original);
    applyArtifacts(root, rendered.artifacts, { context: rendered.context });
    assert.equal(detectDrift(root, ['gemini', 'claude']).hasDrift, false);
    const output = binaries[0].path;
    const disk = path.join(root, output);
    assert.deepEqual(fs.readFileSync(disk), original);
    fs.writeFileSync(disk, edited);
    const report = detectDrift(root, ['gemini', 'claude']);
    assert.equal(report.code, 1, `binary change ${original.toString('hex')} -> ${edited.toString('hex')}`);
    assert.ok(report.findings.MODIFIED_MANAGED_OUTPUT.some(finding => finding.path === output));
    assert.match(report.diffs.find(diff => diff.path === output).diff, /binary/i);
    const lockPath = path.join(root, '.agents/lockfile.v2.json');
    const beforeLock = fs.readFileSync(lockPath);
    assert.throws(() => applyArtifacts(root, rendered.artifacts, { context: rendered.context }), { code: 'CTX_ADAPTER_OWNERSHIP_CONFLICT' });
    assert.deepEqual(fs.readFileSync(disk), edited);
    assert.deepEqual(fs.readFileSync(lockPath), beforeLock);
    fs.writeFileSync(disk, original);
    const record = JSON.parse(beforeLock).managedFiles[output];
    assert.equal(record.exactSha256, computeExactHash(original));
    assert.equal(record.semanticTextSha256, record.exactSha256, 'binary records must not use lossy UTF-8 hashing');
    const note = rendered.artifacts.find(art => art.path.endsWith('/notes.txt'));
    fs.writeFileSync(path.join(root, note.path), note.content.toString('utf8').replace(/\n/g, '\r\n'));
    assert.equal(detectDrift(root, ['gemini', 'claude']).hasDrift, false, 'text CRLF remains semantic');
    assert.equal(applyArtifacts(root, rendered.artifacts, { context: rendered.context }).skipped, true);
    fs.writeFileSync(path.join(dir, 'data.bin'), Buffer.from('810042', 'hex'));
    assert.ok(detectDrift(root, ['gemini', 'claude']).findings.STALE_INPUT.some(finding => finding.path === output));
    const updated = renderAdapters(root, ['gemini', 'claude']);
    applyArtifacts(root, updated.artifacts, { context: updated.context });
    assert.deepEqual(fs.readFileSync(disk), Buffer.from('810042', 'hex'));
    assert.equal(detectDrift(root, ['gemini', 'claude']).hasDrift, false);
  }
});

it('F12 legacy binary ownership cannot authorize a lossy overwrite or prune', t => {
  const { computeExactHash, computeSemanticHash } = require('../.agents/filesystem/index.js');
  for (const operation of ['overwrite', 'prune', 'exact-upgrade']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-binary-legacy-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, '.agents/project/skills/team');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), '# Policy\n');
    fs.writeFileSync(path.join(source, 'skill.yaml'), 'id: team\nresources: [data.bin]\n');
    fs.writeFileSync(path.join(source, 'data.bin'), Buffer.from('810042', 'hex'));
    const output = '.agents/generated/gemini/skills/team/data.bin';
    const disk = path.join(root, output);
    const original = Buffer.from('ff0041', 'hex');
    const edited = operation === 'exact-upgrade' ? original : Buffer.from('fe0041', 'hex');
    fs.mkdirSync(path.dirname(disk), { recursive: true });
    fs.writeFileSync(disk, edited);
    const legacyHash = operation === 'exact-upgrade' ? computeExactHash(original) : computeSemanticHash(original);
    fs.writeFileSync(path.join(root, '.agents/contextos.lock.json'), JSON.stringify({ schemaVersion: 1, managedFiles: { [output]: { managed: true, sha256: legacyHash.slice(7) } } }));
    if (operation === 'prune') fs.rmSync(source, { recursive: true });
    const rendered = renderAdapters(root, 'gemini');
    if (operation === 'exact-upgrade') {
      applyArtifacts(root, rendered.artifacts, { context: rendered.context });
      assert.deepEqual(fs.readFileSync(disk), Buffer.from('810042', 'hex'));
    } else {
      assert.throws(() => applyArtifacts(root, rendered.artifacts, { context: rendered.context }), { code: 'CTX_ADAPTER_OWNERSHIP_CONFLICT' }, operation);
      assert.deepEqual(fs.readFileSync(disk), edited);
    }
  }
});

it('every adapter rejects invalid activation and a missing declared entrypoint before changing outputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-export-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team policy\n---\nTeam rules');
  for (const manifest of ['id: team\nactivation: invalid\n', 'id: team\nentrypoint: absent.md\n']) {
    fs.writeFileSync(path.join(dir, 'skill.yaml'), manifest);
    for (const adapter of listAdapters()) {
      assert.throws(() => renderAdapters(root, adapter), /activation|entrypoint/i, adapter);
    }
    assert.equal(fs.existsSync(path.join(root, '.agents/lockfile.v2.json')), false);
  }
});

it('compiler and all adapters reject invalid declared resources before changing outputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-resource-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team policy\n---\nTeam rules');
  fs.mkdirSync(path.join(dir, 'directory'));
  const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
  for (const resource of ['[missing.md]', '[directory]', 'not-a-list']) {
    fs.writeFileSync(path.join(dir, 'skill.yaml'), `id: team\nresources: ${resource}\n`);
    assert.equal(new ManifestCompiler({ rootDir: root }).compile().success, false, resource);
    for (const adapter of listAdapters()) {
      assert.throws(() => renderAdapters(root, adapter), /resource|ENOENT/i, adapter);
    }
  }
  assert.equal(fs.existsSync(path.join(root, '.agents/lockfile.v2.json')), false);
});

it('Copilot and Aider use metadata from the winning manifest', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-routing-metadata-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Frontmatter fallback\n---\nTeam rules');
  fs.writeFileSync(path.join(dir, 'skill.yaml'), 'id: team\nname: team\ndescription: STALE_METADATA\n');
  fs.writeFileSync(path.join(dir, 'skill.v2.yaml'), 'schemaVersion: 2\nid: team\ndisplayName: Canonical team policy\ndescription: CANONICAL_METADATA\n');
  const { artifacts } = renderAdapters(root, ['copilot', 'aider']);
  for (const file of ['.github/copilot-instructions.md', 'CONVENTIONS.md']) {
    const content = artifacts.find(artifact => artifact.path === file).content.toString('utf8');
    assert.match(content, /Canonical team policy/);
    assert.match(content, /CANONICAL_METADATA/);
    assert.doesNotMatch(content, /STALE_METADATA|Frontmatter fallback/);
  }
});

it('exported links preserve encoded filename characters and URL fragments', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-encoded-resource-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  const files = ['ref#draft.md', 'ref%literal.md', 'ref (draft).md', 'ref(draft).md', 'ref((draft)).md'];
  fs.writeFileSync(path.join(dir, 'skill.yaml'), `id: team\nresources: ${JSON.stringify(files)}\n`);
  const links = files.map((file, i) => `[policy${i}](${i >= 3 ? file : encodeURIComponent(file).replace(/\(/g, '%28').replace(/\)/g, '%29')}#section)`);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: team\ndescription: Team policy\n---\n${links.join('\n')}`);
  for (const file of files) fs.writeFileSync(path.join(dir, file), '# RESOURCE');
  const rendered = renderAdapters(root, 'all');
  applyArtifacts(root, rendered.artifacts, { context: rendered.context });
  for (const output of ['.claude/skills/team/SKILL.md', '.agents/skills/team/SKILL.md', '.cursor/rules/team.mdc', '.zed/prompts/team.md']) {
    const text = fs.readFileSync(path.join(root, output), 'utf8');
    const matches = [...text.matchAll(/\[policy\d\]\(([^)]+)\)/g)];
    assert.strictEqual(matches.length, files.length, output);
    for (const [, href] of matches) {
      assert.ok(href.endsWith('#section'), href);
      const target = path.resolve(root, path.dirname(output), decodeURIComponent(href.slice(0, -'#section'.length)));
      assert.strictEqual(fs.readFileSync(target, 'utf8'), '# RESOURCE', href);
    }
  }
});

for (const activation of ['always', 'auto', 'globs']) {
  it(`exported resource links remain usable for a nested entrypoint (${activation})`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-resource-links-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/project/skills/team');
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skill.yaml'), `id: team\nentrypoint: docs/rules.md\nactivation: ${activation}\nglobs: ["src/**/*.ts"]\nresources: [docs/example.md]\n`);
    fs.writeFileSync(path.join(dir, 'docs/rules.md'), '---\nname: team\ndescription: Team policy\n---\nRead [Example](example.md).\n\n```md\n[Literal](unchanged.md)\n```\n');
    fs.writeFileSync(path.join(dir, 'docs/example.md'), '# Resource marker\n[Policy](rules.md)');
    const rendered = renderAdapters(root, 'all');
    applyArtifacts(root, rendered.artifacts, { context: rendered.context });
    const files = ['.agents/skills/team/SKILL.md', '.agents/generated/gemini/skills/team/SKILL.md', '.cursor/rules/team.mdc', '.zed/prompts/team.md', activation === 'auto' ? '.claude/skills/team/SKILL.md' : '.claude/rules/team.md'];
    if (activation !== 'auto') files.push('.agents/rules/contextos-team.md');
    if (activation === 'always') files.push('.github/copilot-instructions.md', 'CONVENTIONS.md', '.zed/rules.md');
    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      const link = content.match(/\[Example\]\(([^)]+)\)/)[1];
      const resource = path.resolve(root, path.dirname(file), decodeURI(link));
      assert.ok(fs.readFileSync(resource, 'utf8').startsWith('# Resource marker'), file);
      const back = fs.readFileSync(resource, 'utf8').match(/\[Policy\]\(([^)]+)\)/)[1];
      assert.ok(fs.readFileSync(path.resolve(path.dirname(resource), back), 'utf8').includes('Team policy'), 'resource backlink reaches the entrypoint');
      assert.ok(content.includes('[Literal](unchanged.md)'), 'code examples remain literal');
    }
    assert.equal(detectDrift(root, 'all').hasDrift, false);
  });
}

for (const target of ['all', 'gemini', 'claude', 'cursor']) {
  it(`export ${target} prunes the last rule only from selected adapters`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-last-rule-'));
    t.after(() => {
      assert.ok(root.startsWith(path.join(os.tmpdir(), 'ctx-last-rule-')));
      fs.rmSync(root, { recursive: true, force: true });
    });
    const cli = path.resolve(__dirname, '../bin/index.js');
    const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
    run(['init']);
    const source = path.join(root, '.agents/project/skills/team');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: team\ndescription: Team rule\nactivation: always\n---\nTeam policy');
    run(['export', 'all']);
    const files = {
      gemini: '.agents/skills/team/SKILL.md',
      claude: '.claude/rules/team.md',
      cursor: '.cursor/rules/team.mdc',
    };
    fs.unlinkSync(path.join(source, 'SKILL.md'));
    fs.rmdirSync(source);
    run(['export', target]);
    for (const [adapter, file] of Object.entries(files)) {
      assert.strictEqual(fs.existsSync(path.join(root, file)), target !== 'all' && target !== adapter, file);
    }
    const lock = JSON.parse(fs.readFileSync(path.join(root, '.agents/lockfile.v2.json'), 'utf8'));
    for (const [adapter, file] of Object.entries(files)) {
      assert.strictEqual(Boolean(lock.managedFiles[file]), target !== 'all' && target !== adapter, file);
    }
    if (target === 'all') assert.strictEqual(JSON.parse(run(['export', 'all', '--check', '--json'])).hasDrift, false);
  });
}

describe('pure-compiler.js — Pure Adapter Contract & Multi-Adapter Rendering', () => {
  it('registers and lists all 6 standard adapters', () => {
    const adapters = listAdapters();
    assert.ok(adapters.includes('gemini'));
    assert.ok(adapters.includes('claude'));
    assert.ok(adapters.includes('cursor'));
    assert.ok(adapters.includes('copilot'));
    assert.ok(adapters.includes('aider'));
    assert.ok(adapters.includes('zed'));
  });

  it('renderAdapters executes purely in-memory with zero disk side effects', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const result = renderAdapters(projectRoot, ['gemini', 'cursor']);

    assert.ok(Array.isArray(result.artifacts));
    assert.ok(result.artifacts.length > 0);
    assert.strictEqual(result.collisions.length, 0);

    // Verify artifact contract structure
    const sample = result.artifacts[0];
    assert.ok(typeof sample.path === 'string');
    assert.ok(Buffer.isBuffer(sample.content));
    assert.ok(typeof sample.generator === 'string');
    assert.ok(sample.kind === 'generated-adapter');
    assert.strictEqual(sample.inputsHash, undefined, 'a whole-graph hash per artifact makes every entry change on every edit');
  });

  it('generates deterministic provenance headers without volatile timestamps', () => {
    const meta = {
      generator: 'cursor@2',
      sourceGraphHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      profileId: 'startup',
    };

    const header1 = createProvenanceHeader(meta, 'markdown');
    const header2 = createProvenanceHeader(meta, 'markdown');

    assert.strictEqual(header1, header2);
    assert.ok(header1.includes('Adapter: cursor@2'));
    assert.strictEqual(header1.includes('Source graph'), false, 'no hash that changes with every rule edit');
    assert.ok(header1.includes('Profile: startup'));
    assert.strictEqual(header1.includes('Date'), false);
    assert.strictEqual(header1.includes('202'), false); // No year/timestamp
  });

  it('detects path collisions between conflicting adapters', () => {
    // Mock a colliding adapter
    const mockColliding = {
      describe: () => ({ name: 'mock-collision' }),
      render: () => [
        {
          path: '.cursor/rules/00-project-rules.mdc', // Collides with cursor adapter
          content: 'collision content',
          generator: 'mock-collision@2',
        },
      ],
      validate: () => [],
    };

    const { registerAdapter } = require('../.agents/adapters/pure-compiler.js');
    registerAdapter('mock-collision', mockColliding);

    const projectRoot = path.resolve(__dirname, '..');
    const result = renderAdapters(projectRoot, ['cursor', 'mock-collision']);

    assert.ok(result.collisions.length > 0);
    const collision = result.collisions.find(c => c.path === '.cursor/rules/00-project-rules.mdc');
    assert.ok(collision);
    assert.strictEqual(collision.firstAdapter, 'cursor@2');
    assert.strictEqual(collision.secondAdapter, 'mock-collision@2');
  });
});

describe('drift-detector.js — Adapter Output Drift Detection', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `ctx-drift-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpRoot, { recursive: true });

    // Seed minimal project structure
    fs.mkdirSync(path.join(tmpRoot, '.agents', 'core', 'skills', 'test-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, '.agents', 'core', 'skills', 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: Test skill\n---\n# Test Skill\nContent\n'
    );
    fs.writeFileSync(
      path.join(tmpRoot, '.agents', 'core', 'skills', 'test-skill', 'skill.yaml'),
      'schemaVersion: 2\nid: test-skill\nname: test-skill\ndescription: Test skill\nentrypoint: SKILL.md\n'
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it('flags MISSING_OUTPUT when projected artifacts are absent on disk', () => {
    const report = detectDrift(tmpRoot, ['cursor']);
    assert.strictEqual(report.hasDrift, true);
    assert.ok(report.findings[DRIFT_STATES.MISSING_OUTPUT].length > 0);
    assert.ok(report.diffs.length > 0);
  });

  it('reports zero drift after artifacts are cleanly applied via transaction', () => {
    const { renderAdapters, applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(tmpRoot, ['cursor']);
    applyArtifacts(tmpRoot, rendered.artifacts, { context: rendered.context });

    const report = detectDrift(tmpRoot, ['cursor']);
    assert.strictEqual(report.hasDrift, false);
    assert.strictEqual(report.totalFindings, 0);
  });

  it('flags MODIFIED_MANAGED_OUTPUT when user edits an applied artifact', () => {
    const { renderAdapters, applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(tmpRoot, ['cursor']);
    applyArtifacts(tmpRoot, rendered.artifacts, { context: rendered.context });

    // Simulate user editing .cursorrules on disk
    const editedPath = rendered.artifacts[0].path;
    fs.writeFileSync(path.join(tmpRoot, editedPath), '# USER MODIFIED CONTENT THAT DRIFTED\n', 'utf8');

    const report = detectDrift(tmpRoot, ['cursor']);
    assert.strictEqual(report.hasDrift, true);
    assert.ok(
      report.findings[DRIFT_STATES.MODIFIED_MANAGED_OUTPUT].some(f => f.path === editedPath)
    );
  });

  it('computeDiffSnippet accurately formats line differences', () => {
    const before = 'line 1\nline 2\nline 3';
    const after = 'line 1\nline 2 (modified)\nline 3';
    const snippet = computeDiffSnippet(before, after);
    assert.ok(snippet.includes('- line 2'));
    assert.ok(snippet.includes('+ line 2 (modified)'));
  });
});
