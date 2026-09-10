/**
 * tests/pure-adapters.test.js
 * Test suite for Pure Adapter Contract, Provenance Headers & Drift Detection (Milestone 7)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  renderAdapters,
  listAdapters,
  getAdapter,
  createProvenanceHeader,
  applyArtifacts,
} = require('../.agents/adapters/pure-compiler.js');
const { detectDrift, computeDiffSnippet, DRIFT_STATES } = require('../.agents/adapters/drift-detector.js');

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
    assert.ok(sample.inputsHash.startsWith('sha256:'));
  });

  it('generates deterministic provenance headers without volatile timestamps', () => {
    const meta = {
      generator: 'cursor@2',
      sourceGraphHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      profileId: 'startup',
      profileHash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    };

    const header1 = createProvenanceHeader(meta, 'markdown');
    const header2 = createProvenanceHeader(meta, 'markdown');

    assert.strictEqual(header1, header2);
    assert.ok(header1.includes('Adapter: cursor@2'));
    assert.ok(header1.includes('Source graph: sha256:1111'));
    assert.ok(header1.includes('Profile: startup sha256:2222'));
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
    const targetFile = path.join(tmpRoot, '.cursor', 'rules', '00-project-rules.mdc');
    fs.writeFileSync(targetFile, '# USER MODIFIED CONTENT THAT DRIFTED\n', 'utf8');

    const report = detectDrift(tmpRoot, ['cursor']);
    assert.strictEqual(report.hasDrift, true);
    assert.ok(
      report.findings[DRIFT_STATES.MODIFIED_MANAGED_OUTPUT].some(f => f.path === '.cursor/rules/00-project-rules.mdc')
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
