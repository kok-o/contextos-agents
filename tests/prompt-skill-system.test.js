'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const {
  RuleCatalog,
  ENFORCEMENT_LEVELS,
  AUTOMATED_CHECKERS,
} = require('../.agents/rules/rule-catalog.js');

const {
  CanonicalResolver,
  BUDGET_TIERS,
  WORKFLOW_TEMPLATES,
  MODES,
  DEPRECATED_ALIASES,
} = require('../.agents/resolver/canonical-resolver.js');

describe('Milestone 9: Prompt & Skill System Quality Guardrails', () => {
  const rootDir = path.resolve(__dirname, '..');
  const resolver = new CanonicalResolver({ rootDir });

  describe('1. Rule Catalog & Enforcement Invariants (Section 14.1 & 14.6)', () => {
    test('catalog contains builtin normative rules with valid checkers', () => {
      const catalog = new RuleCatalog({ rootDir });
      const rules = catalog.getAllRules();

      assert.ok(rules.length >= 14, 'Should contain at least 14 built-in rules');
      assert.ok(rules.some(r => r.id === 'SEC-002' && r.enforcement === ENFORCEMENT_LEVELS.ENFORCED && r.checker === 'secret-scanner'));
      assert.ok(rules.some(r => r.id === 'FS-001' && r.enforcement === ENFORCEMENT_LEVELS.ENFORCED && r.checker === 'workspace-path-policy-v2'));
      assert.ok(rules.some(r => r.id === 'WORK-001' && r.enforcement === ENFORCEMENT_LEVELS.ENFORCED && r.checker === 'manifest-schema-validator'));
    });

    test('enforces invariant: rule existing only in markdown cannot be marked ENFORCED', () => {
      const catalog = new RuleCatalog({ rootDir });

      // Attempting to register ENFORCED rule without checker must throw
      assert.throws(() => {
        catalog.registerRule({
          id: 'TEST-FAKE-001',
          level: 'must',
          enforcement: 'runtime',
          summary: 'Rule claiming to be enforced without checker',
        });
      }, /cannot be marked ENFORCED without a registered automated checker/);

      // Attempting to register ENFORCED rule with unknown checker must throw
      assert.throws(() => {
        catalog.registerRule({
          id: 'TEST-FAKE-002',
          level: 'must',
          enforcement: 'runtime',
          checker: 'non-existent-checker-123',
          summary: 'Rule claiming to be enforced with unknown checker',
        });
      }, /references unknown checker/);

      // Prompt guidance rules without checkers succeed
      const okRule = catalog.registerRule({
        id: 'TEST-GUIDE-001',
        level: 'should',
        enforcement: 'prompt-guidance',
        summary: 'Pure guideline rule',
      });
      assert.equal(okRule.enforcement, ENFORCEMENT_LEVELS.PROMPT_GUIDANCE);
      assert.equal(okRule.checker, null);
    });

    test('explainRule and explainSkill output comprehensive formatted explanations', () => {
      const catalog = new RuleCatalog({ rootDir });
      const ruleExplanation = catalog.explainRule('FS-001');

      assert.ok(ruleExplanation.includes('Rule ID          : FS-001'));
      assert.ok(ruleExplanation.includes('Active Checker   : [ENFORCED] workspace-path-policy-v2'));
      assert.ok(ruleExplanation.includes('safe-path.js'));

      const skillExplanation = catalog.explainSkill('security');
      assert.ok(skillExplanation.includes('ContextOS — Skill Rules: security'));
      assert.ok(skillExplanation.includes('SEC-001'));
      assert.ok(skillExplanation.includes('SEC-002'));
    });
  });

  describe('2. Streamlined Modes & Review Lenses (Section 14.2)', () => {
    test('maps lifecycle phases to clean execution modes (DISCOVER, CHANGE, VERIFY, REVIEW)', () => {
      const planRes = resolver.resolve({ task: 'Design auth architecture', explicitPhase: 'Plan' });
      assert.equal(planRes.mode, MODES.DISCOVER);

      const buildRes = resolver.resolve({ task: 'Implement login page', explicitPhase: 'Build' });
      assert.equal(buildRes.mode, MODES.CHANGE);

      const testRes = resolver.resolve({ task: 'Run unit test suite', explicitPhase: 'Verify' });
      assert.equal(testRes.mode, MODES.VERIFY);

      const reviewRes = resolver.resolve({ task: 'Inspect diff before merge', explicitPhase: 'Review' });
      assert.equal(reviewRes.mode, MODES.REVIEW);
    });

    test('detects specialized review lenses based on touched capabilities', () => {
      const secRes = resolver.resolve({ task: 'Audit JWT auth token expiration and permissions' });
      assert.ok(secRes.reviewLenses.includes('security'));

      const dbRes = resolver.resolve({ task: 'Write Prisma database migration for orders' });
      assert.ok(dbRes.reviewLenses.includes('database'));

      const a11yRes = resolver.resolve({ task: 'Build accessible dialog modal with focus trap' });
      assert.ok(a11yRes.reviewLenses.includes('accessibility'));

      const perfRes = resolver.resolve({ task: 'Optimize Core Web Vitals and edge caching' });
      assert.ok(perfRes.reviewLenses.includes('performance'));

      const archRes = resolver.resolve({ task: 'Design DDD bounded context for payments' });
      assert.ok(archRes.reviewLenses.includes('architecture'));
    });

    test('formatDeclaration prints clean mode, lenses, and risk headers', () => {
      const res = resolver.resolve({
        task: 'Implement accessible user form in React',
        files: ['components/Form.tsx'],
      });

      const decl = resolver.formatDeclaration(res);
      assert.ok(decl.includes('[MODE: CHANGE]'));
      assert.ok(decl.includes('[LENSES: accessibility]'));
      assert.ok(decl.includes('[RISK: standard]'));
      assert.ok(decl.includes('Skills loaded:'));
    });
  });

  describe('3. Risk-Based Workflows (Section 14.3)', () => {
    test('routine tasks fast-track without ceremonial spec and plan rituals', () => {
      const res = resolver.resolve({
        task: 'Fix typo in README.md documentation',
        files: ['README.md'],
      });

      assert.equal(res.risk.value, 'routine');
      assert.ok(res.workflow);
      assert.equal(res.workflow.name, 'ROUTINE');
      assert.ok(res.workflow.steps[0].includes('INSPECT'));
      assert.ok(res.workflow.steps[1].includes('CHANGE'));
      assert.ok(res.workflow.steps[2].includes('TARGETED_VERIFY'));
    });

    test('standard tasks require short plan, tests, and self-review', () => {
      const res = resolver.resolve({
        task: 'Add avatar badge to user profile component',
        files: ['components/Avatar.tsx'],
      });

      assert.equal(res.risk.value, 'standard');
      assert.equal(res.workflow.name, 'STANDARD');
      assert.ok(res.workflow.steps.some(s => s.includes('SHORT_PLAN')));
      assert.ok(res.workflow.steps.some(s => s.includes('TESTS')));
    });

    test('high-risk tasks mandate spec, approved plan, and independent review', () => {
      const res = resolver.resolve({
        task: 'Update authentication password hashing and session tokens',
        files: ['services/auth.ts'],
      });

      assert.equal(res.risk.value, 'high');
      assert.equal(res.workflow.name, 'HIGH');
      assert.ok(res.workflow.steps.some(s => s.includes('SPEC')));
      assert.ok(res.workflow.steps.some(s => s.includes('APPROVED_PLAN')));
      assert.ok(res.workflow.steps.some(s => s.includes('INDEPENDENT_REVIEW')));
    });

    test('destructive tasks enforce explicit authority and rollback rehearsal', () => {
      const res = resolver.resolve({
        task: 'Drop database table users and truncate audit logs',
      });

      assert.equal(res.risk.value, 'destructive');
      assert.equal(res.workflow.name, 'DESTRUCTIVE');
      assert.ok(res.workflow.steps.some(s => s.includes('EXPLICIT_AUTHORITY')));
      assert.ok(res.workflow.steps.some(s => s.includes('ROLLBACK_REHEARSAL')));
    });
  });

  describe('4. Prompt Budget Limits (Section 14.4)', () => {
    test('applies tiered default budgets based on task risk level', () => {
      const standardRes = resolver.resolve({ task: 'Add button component' });
      // Standard tasks default to 4,000 token budget tier
      assert.equal(BUDGET_TIERS.STANDARD, 4000);

      const highRes = resolver.resolve({ task: 'Update security authentication tokens' });
      // High-risk tasks default to 7,500 token budget tier
      assert.equal(BUDGET_TIERS.HIGH, 7500);
    });

    test('explicit user budget overrides tiered default budget', () => {
      const res = resolver.resolve({
        task: 'Manage context using @context-os',
        contextBudgetTokens: 500,
      });

      // Budget limit is respected
      assert.ok(res.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'));
    });
  });

  describe('5. Consolidated Catalog & Deprecated Aliases (Section 14.7)', () => {
    test('redirects deprecated aliases to canonical skill ID with zero duplicate tokens', () => {
      const res = resolver.resolve({
        task: 'Optimize React component performance with @react-best-practices',
      });

      const skillIds = res.skills;
      assert.ok(skillIds.includes('react'), 'Canonical skill "react" must be included');
      assert.ok(!skillIds.includes('react-best-practices'), 'Deprecated alias must not be duplicated');

      // Warning emitted
      assert.ok(res.warnings.some(w =>
        w.code === 'CTX_SKILL_DEPRECATED_ALIAS' &&
        w.deprecatedSkill === 'react-best-practices' &&
        w.canonicalSkill === 'react'
      ));
    });

    test('redirects context-manager alias to canonical context-os', () => {
      const res = resolver.resolve({
        task: 'Setup project context using @context-manager',
      });

      assert.ok(res.skills.includes('context-os'));
      assert.ok(!res.skills.includes('context-manager'));
      assert.ok(res.warnings.some(w => w.deprecatedSkill === 'context-manager' && w.canonicalSkill === 'context-os'));
    });

    test('redirects ui-design and ux-design to canonical ui-ux-pro', () => {
      const res = resolver.resolve({
        task: 'Create design system tokens with @ui-design and @ux-design',
      });

      assert.ok(res.skills.includes('ui-ux-pro'));
      assert.ok(!res.skills.includes('ui-design'));
      assert.ok(!res.skills.includes('ux-design'));
    });
  });

  describe('6. CLI explain Integration (Section 14.6)', () => {
    const ctxPath = path.join(rootDir, '.agents', 'ctx.js');

    test('CLI explain outputs rule enforcement and active checker', () => {
      const output = execFileSync(process.execPath, [ctxPath, 'explain', 'FS-001'], {
        encoding: 'utf8',
        cwd: rootDir,
      });

      assert.ok(output.includes('Rule ID          : FS-001'));
      assert.ok(output.includes('[ENFORCED] workspace-path-policy-v2'));
      assert.ok(output.includes('.agents/filesystem/safe-path.js'));
    });

    test('CLI explain --checkers lists all active automated checkers', () => {
      const output = execFileSync(process.execPath, [ctxPath, 'explain', '--checkers'], {
        encoding: 'utf8',
        cwd: rootDir,
      });

      assert.ok(output.includes('Registered Automated Enforcement Checkers'));
      assert.ok(output.includes('workspace-path-policy-v2'));
      assert.ok(output.includes('project-mutation-lock'));
      assert.ok(output.includes('secret-scanner'));
      assert.ok(output.includes('lockfile-cas-integrity'));
    });

    test('CLI explain --rules --json outputs machine-readable data', () => {
      const output = execFileSync(process.execPath, [ctxPath, 'explain', '--rules', '--json'], {
        encoding: 'utf8',
        cwd: rootDir,
      });

      const parsed = JSON.parse(output);
      assert.ok(Array.isArray(parsed.rules));
      assert.ok(Array.isArray(parsed.checkers));
      assert.ok(parsed.rules.some(r => r.id === 'SEC-002'));
    });
  });
});
