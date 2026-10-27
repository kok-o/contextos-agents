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
