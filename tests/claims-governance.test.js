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

test('Product Positioning — contains ICPs, boundaries, and governance statements', () => {
  const docPath = path.resolve('docs/product/positioning.md');
  assert.equal(fs.existsSync(docPath), true, 'docs/product/positioning.md must exist');

  const content = fs.readFileSync(docPath, 'utf8');
  assert.ok(content.includes('Primary ICP'), 'Must specify Primary ICP');
  assert.ok(content.includes('Anti-ICP'), 'Must specify Anti-ICP');
  assert.ok(content.includes('ContextOS Core'), 'Must specify Core layer');
  assert.ok(content.includes('ContextOS Runtime'), 'Must specify Runtime layer');
  assert.ok(content.includes('ContextOS Catalog'), 'Must specify Catalog layer');
  assert.ok(content.includes('benchmarks/claims.json'), 'Must link to claims registry');
});

test('Claim Linter Script — execution and validation', () => {
  // lintClaims should execute without throwing or exiting with error
  assert.doesNotThrow(() => {
    lintClaims();
  });
});
