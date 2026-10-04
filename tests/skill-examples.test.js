/**
 * tests/skill-examples.test.js
 * ContextOS Phase 4: Skill Examples Verification and Quality Gate Tests
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('node:fs');
const { execFileSync } = require('child_process');

const {
  FIRST_COVERAGE_SKILLS,
  extractSkillExamples,
  verifyCoverageExamples,
} = require('../scripts/verify-skill-examples.js');

const securityRunner = require('./fixtures/skill-examples/security-runner.js');
const a11yRunner = require('./fixtures/skill-examples/web-accessibility-runner.js');

const VERIFY_SCRIPT = path.resolve(__dirname, '../scripts/verify-skill-examples.js');
const NODE = process.execPath;

test('Phase 4: Skill Code Examples Quality and Negative Proof', async (t) => {
  await t.test('Task 4.1: First coverage inventory extracts and classifies all code blocks', () => {
    assert.deepStrictEqual(FIRST_COVERAGE_SKILLS.map(s => s.id),
      ['fastapi', 'web-accessibility', 'adapters', 'typescript', 'security']);

    for (const skill of FIRST_COVERAGE_SKILLS) {
      const examples = extractSkillExamples(skill);
      assert.ok(examples.length > 0, `Skill ${skill.id} must contain code examples`);

      // Zero unverified blocks allowed in first coverage
      const unverified = examples.filter(e => e.type === 'unverified');
      assert.strictEqual(unverified.length, 0, `Skill ${skill.id} must have 0 unverified blocks`);

      for (const ex of examples) {
        assert.ok(ex.id, 'Example must have a unique ID');
        assert.ok(['runnable', 'illustrative', 'expected-failure'].includes(ex.type), `Valid type for ${ex.id}`);
      }
    }
  });

  await t.test('Task 4.3 & 4.7: Security examples pass positive and negative verification', async () => {
    const results = securityRunner.runSecurityExamples();
    assert.strictEqual(results.length, 3);
    for (const r of results) {
      assert.strictEqual(r.passed, true, `Security check ${r.id} must pass`);
    }

    const ssrfResults = await securityRunner.runSsrfExamples();
    assert.strictEqual(ssrfResults.length, 4);
    for (const r of ssrfResults) {
      assert.strictEqual(r.passed, true, `SSRF check ${r.id} must pass`);
    }
  });

  await t.test('Task 4.6: Web accessibility modal and focus CSS pass behavioral verification', () => {
    const modalResults = a11yRunner.verifyAccessibleModalBehavior();
    assert.strictEqual(modalResults.length, 3);
    for (const r of modalResults) {
      assert.strictEqual(r.passed, true, `Modal check ${r.id} must pass`);
    }
  });

  await t.test('Task 4.9: Negative proof - broken examples actively fail verification', async () => {
    // 1. Broken security HMAC check (modified payload must fail)
    const valid = securityRunner.verifyWebhookSignature('payload', 'dummy-sig', 'secret');
    assert.strictEqual(valid, false, 'Invalid signature must not verify');

    // 2. Broken SSRF target (unauthorized host must throw)
    let ssrfBlocked = false;
    try {
      await securityRunner.fetchFromAllowlist(
        'https://attacker-internal.corp/admin',
        new Set(['api.example.com'])
      );
    } catch (err) {
      ssrfBlocked = true;
      assert.match(err.message, /destination host "attacker-internal.corp" is not in the approved allowlist/);
    }
    assert.ok(ssrfBlocked, 'Unauthorized host must be blocked');

    // 3. Broken CSS check (missing outline-offset must fail assertion)
    assert.throws(
      () => a11yRunner.verifyFocusVisibleCss('button:focus-visible { outline: 2px solid blue; }'),
      /outline-offset/,
      'CSS without outline-offset must fail verification'
    );
  });

  await t.test('Task 4.12: CLI execution of verify-skill-examples returns clean exit code and JSON', () => {
    const stdout = execFileSync(NODE, [VERIFY_SCRIPT, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);

    assert.strictEqual(parsed.ok, true, 'Verification pipeline must report ok: true');
    assert.strictEqual(parsed.stats.verificationsFailed, 0, 'Zero failed verifications');
    assert.strictEqual(parsed.stats.byType.unverified, 0, 'Zero unverified blocks in first coverage');
    assert.ok(parsed.stats.verificationsRun >= 15, 'Must run all declared verifications');
    assert.ok(parsed.coverage.catalogSkills.includes('typescript'));
    assert.strictEqual(parsed.stats.fixtureChecksRun, 3);
    assert.ok(parsed.behavioralResults.filter(r => r.id.startsWith('web-accessibility:modal:'))
      .every(r => r.kind === 'fixture-simulation'));
    assert.ok(!parsed.behavioralResults.some(r => r.id.startsWith('fastapi:')),
      'AST-only copied FastAPI snippets must not count as behavioral proof');
  });

  await t.test('TypeScript guard verifies the original block and rejects the previous unsafe implementation', () => {
    const { verifyTypescriptExample } = require('../scripts/verify-typescript-example.cjs');
    assert.ok(verifyTypescriptExample().every(r => r.passed));
    const source = fs.readFileSync(path.resolve(__dirname, '../catalog/skills/typescript/SKILL.md'), 'utf8');
    const broken = source.replace(/export function isUser[\s\S]*?\n}/,
      "export function isUser(value: unknown): value is User {\n  return typeof value === 'object' && value !== null && 'id' in value;\n}");
    assert.notStrictEqual(broken, source, 'Mutation must replace the original example');
    const failed = verifyTypescriptExample({ source: broken }).filter(r => !r.passed).map(r => r.id);
    assert.deepStrictEqual(failed, ['array', 'missing-fields', 'numeric-id', 'numeric-name', 'invalid-role']
      .map(name => `typescript:user-guard:${name}`));
  });
});
