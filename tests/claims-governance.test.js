/**
 * tests/claims-governance.test.js
 * ContextOS — Claim Governance & Product Positioning Test Suite
 *
 * Verifies Milestone 18 (Issue #22):
 *   - Claims registry structure and evidence links (benchmarks/claims.json)
 *   - Product positioning documentation (docs/product/positioning.md)
 *   - Quantitative assertion linting script (scripts/lint-claims.js)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lintClaims } = require('../scripts/lint-claims');
const os = require('os');

test('F16: shipped registry descriptions match their canonical skill metadata', () => {
  const yaml = require('../.agents/compiler/vendor/yaml.js');
  const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../registry.json'), 'utf8'));
  for (const skill of registry.skills) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', skill.path, 'SKILL.md'), 'utf8');
    const metadata = yaml.parse(source.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
    assert.equal(skill.name, metadata.name);
    assert.equal(skill.description, metadata.description.trim(), skill.id);
  }
});

test('F16: claims lint rejects uncited quantitative claims in public JSON fields', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-json-claims-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'benchmarks'));
  fs.writeFileSync(path.join(root, 'benchmarks/claims.json'), JSON.stringify({ claims: [] }));
  fs.writeFileSync(path.join(root, 'registry.json'), JSON.stringify({ skills: [{ description: 'Reduces code output ~54%.' }] }));
  const { spawnSync } = require('child_process');
  const script = path.resolve(__dirname, '../scripts/lint-claims.js');
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(script)}).lintClaims({rootDir:${JSON.stringify(root)}})`], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /registry\.json.*skills.*description/);
});

for (const status of ['invalidated', 'deprecated', 'stale', 'aspirational', 'measured']) {
  test(`CR08: public quantitative metadata requires current supported evidence (${status})`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-cited-json-claim-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'benchmarks'));
    fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({ status }));
    fs.writeFileSync(path.join(root, 'benchmarks/claims.json'), JSON.stringify({ claims: [{
      id: 'claim-fixture', status, statement: 'Reduces output by 54%.', evidenceArtifact: 'evidence.json',
    }] }));
    fs.writeFileSync(path.join(root, 'registry.json'), JSON.stringify({ skills: [{ description: 'Reduces output by 54% claim-fixture.' }] }));
    const script = path.resolve(__dirname, '../scripts/lint-claims.js');
    const run = () => require('child_process').spawnSync(process.execPath, ['-e', `require(${JSON.stringify(script)}).lintClaims({rootDir:${JSON.stringify(root)}})`], { encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, status === 'measured' ? 0 : 1, result.stdout + result.stderr);
    if (status === 'measured') {
      fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({ status: 'stale' }));
      const staleEvidence = run();
      assert.equal(staleEvidence.status, 1, staleEvidence.stdout + staleEvidence.stderr);
      fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({ status: 'measured' }));
      const claimsFile = path.join(root, 'benchmarks/claims.json');
      const data = JSON.parse(fs.readFileSync(claimsFile, 'utf8'));
      data.claims[0].validUntil = '2000-01-01T00:00:00.000Z';
      fs.writeFileSync(claimsFile, JSON.stringify(data));
      const expired = run();
      assert.equal(expired.status, 1, expired.stdout + expired.stderr);
    }
  });
}

test('Claims Registry — schema validation and evidence linking', () => {
  const claimsPath = path.resolve('benchmarks/claims.json');
  assert.equal(fs.existsSync(claimsPath), true, 'benchmarks/claims.json must exist');

  const content = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
  assert.equal(content.schemaVersion, 1);
  assert.ok(Array.isArray(content.claims), 'Must have claims array');
  assert.ok(content.claims.length >= 3, 'Must contain core registered claims');

  for (const claim of content.claims) {
    assert.ok(claim.id.startsWith('claim-'), `Claim ID must start with claim-: ${claim.id}`);
    assert.ok(claim.statement, 'Claim must have a statement');
    assert.ok(claim.evidenceArtifact, 'Claim must link to evidence artifact');
    const evidencePath = path.resolve(claim.evidenceArtifact);
    assert.equal(
      fs.existsSync(evidencePath),
      true,
      `Evidence artifact must exist: ${claim.evidenceArtifact}`
    );

    if (evidencePath.endsWith('.json')) {
      const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      if (evidence.status === 'invalidated') {
        assert.equal(
          claim.status,
          'invalidated',
          `Claim "${claim.id}" must have status "invalidated" matching its evidence artifact`
        );
      }
    }
  }
});

test('Product Positioning — separates the stable core from beta and experimental layers', () => {
  const docPath = path.resolve('docs/product/positioning.md');
  assert.equal(fs.existsSync(docPath), true, 'docs/product/positioning.md must exist');

  const content = fs.readFileSync(docPath, 'utf8');
  assert.ok(content.includes('Primary ICP'), 'Must specify Primary ICP');
  assert.ok(content.includes('Anti-ICP'), 'Must specify Anti-ICP');
  assert.ok(content.includes('ContextOS Core'), 'Must specify Core layer');
  assert.ok(content.includes('MCP Server'), 'Must specify the separate MCP beta layer');
  assert.ok(content.includes('Runtime'), 'Must specify the experimental runtime layer');
  assert.ok(content.includes('outside the stable core contract'), 'Must keep runtime outside stable core scope');
  assert.ok(content.includes('does not make quantitative performance guarantees'), 'Must avoid unsupported performance claims');
  assert.equal(content.includes('benchmarks/claims.json'), false, 'Product positioning must not market internal benchmark tooling');
});

test('Claim Linter Script — execution and validation', () => {
  // lintClaims should execute without throwing or exiting with error
  assert.doesNotThrow(() => {
    lintClaims();
  });
});
