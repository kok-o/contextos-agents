'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { CanonicalResolver, DEFAULT_CONTEXT_BUDGET_TOKENS, WEIGHTS } = require('../.agents/resolver/canonical-resolver.js');

describe('canonical-resolver.js — Milestone 3 Canonical Resolver Engine', () => {
  const rootDir = path.resolve(__dirname, '..');
  const resolver = new CanonicalResolver({ rootDir });

  test('resolves structured ResolutionResult matching architecture contract', () => {
    const res = resolver.resolve({
      task: 'Build a secure authentication login page in Next.js',
      files: ['app/login/page.tsx'],
    });

    assert.ok(res.registryFingerprint, 'Should have registry fingerprint');
    assert.ok(res.workspaceFingerprint, 'Should have workspace fingerprint');
    assert.equal(typeof res.phase, 'object', 'Phase should be structured object');
    assert.equal(res.phase.value, 'Build');
    assert.equal(typeof res.risk, 'object', 'Risk should be structured object');
    assert.equal(res.risk.value, 'high', 'Touches authentication -> risk: high');
    assert.ok(Array.isArray(res.selected), 'Selected should be array');
    assert.ok(Array.isArray(res.excluded), 'Excluded should be array');
    assert.ok(Array.isArray(res.conflicts), 'Conflicts should be array');
    assert.ok(Array.isArray(res.warnings), 'Warnings should be array');
    assert.ok(res.totalEstimatedTokens > 0, 'Total tokens should be > 0');
    assert.ok(Array.isArray(res.skills), 'Skills array should be provided for compatibility');
  });

  test('evaluates risk classification accurately across destructive, high, routine, and standard', () => {
    const destructive = resolver.resolve({ task: 'Drop table users and truncate audit log' });
    assert.equal(destructive.risk.value, 'destructive');

    const high = resolver.resolve({ task: 'Update JWT signing key and database migration' });
    assert.equal(high.risk.value, 'high');

    const routine = resolver.resolve({ task: 'Fix typo in README.md documentation', files: ['README.md'] });
    assert.equal(routine.risk.value, 'routine');

    const standard = resolver.resolve({ task: 'Add user avatar display component' });
    assert.equal(standard.risk.value, 'standard');
  });

  test('transitive dependency closure admits clusters and links requiredBy', () => {
    const res = resolver.resolve({ task: 'Configure Next.js server actions' });
    const selectedIds = res.selected.map(s => s.id);

    assert.ok(selectedIds.includes('nextjs'), 'nextjs must be selected');
    assert.ok(selectedIds.includes('react'), 'react must be pulled for nextjs');
    assert.ok(selectedIds.includes('typescript'), 'typescript must be pulled for nextjs');

    const reactEntry = res.selected.find(s => s.id === 'react');
    assert.ok(reactEntry.requiredBy.includes('nextjs'), 'react should indicate requiredBy nextjs');

    const tsEntry = res.selected.find(s => s.id === 'typescript');
    assert.ok(tsEntry.requiredBy.includes('nextjs') || tsEntry.requiredBy.includes('react'), 'typescript should indicate parent requirers');
  });

  test('budget planner clusters candidate with required dependencies and emits warning on mandatory overflow', () => {
    // Force a very small budget (500 tokens) with an explicit skill
    const res = resolver.resolve({
      task: 'Build something with @nextjs',
      contextBudgetTokens: 500,
    });

    // nextjs is explicitly requested -> mandatory
    assert.ok(res.skills.includes('nextjs'), 'Mandatory skill must not be evicted');
    assert.ok(res.skills.includes('react'), 'Required dependency must not be evicted');
    assert.ok(res.skills.includes('typescript'), 'Required dependency must not be evicted');

    // Warning should be recorded
    assert.ok(res.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'), 'Should warn on budget exceeded for mandatory cluster');
  });

  test('conflict resolution policy favors explicit over inferred skill', () => {
    // Create custom registry with conflicting skills
    const customRegistry = {
      sourceGraphHash: 'sha256:test-hash',
      dependencyGraph: {},
      skills: {
        'library-a': {
          displayName: 'Library A',
          estimatedTokens: 1000,
          dependencies: { requires: [], conflicts: ['library-b'] },
          signals: { keywords: [{ value: 'lib-a', weight: 40 }] },
        },
        'library-b': {
          displayName: 'Library B',
          estimatedTokens: 1000,
          dependencies: { requires: [], conflicts: ['library-a'] },
          signals: { keywords: [{ value: 'lib-b', weight: 40 }] },
        },
      },
    };

    const conflictResolver = new CanonicalResolver({ rootDir, registry: customRegistry });

    // Explicit library-a vs inferred library-b
    const res = conflictResolver.resolve({
      task: 'Use lib-b for feature @library-a',
    });

    const selectedIds = res.selected.map(s => s.id);
    assert.ok(selectedIds.includes('library-a'), 'Explicit skill library-a must win');
    assert.ok(!selectedIds.includes('library-b'), 'Inferred skill library-b must be evicted');
    assert.ok(res.excluded.some(e => e.id === 'library-b' && e.reasonCode === 'conflict'), 'library-b should be listed in excluded with conflict reason');
  });

  test('conflict resolution records error when both conflicting skills are explicitly requested', () => {
    const customRegistry = {
      sourceGraphHash: 'sha256:test-hash',
      dependencyGraph: {},
      skills: {
        'library-a': {
          displayName: 'Library A',
          estimatedTokens: 1000,
          dependencies: { requires: [], conflicts: ['library-b'] },
        },
        'library-b': {
          displayName: 'Library B',
          estimatedTokens: 1000,
          dependencies: { requires: [], conflicts: ['library-a'] },
        },
      },
    };

    const conflictResolver = new CanonicalResolver({ rootDir, registry: customRegistry });
    const res = conflictResolver.resolve({
      task: 'Integrate both @library-a and @library-b',
    });

    assert.ok(res.conflicts.length > 0, 'Should record conflict entry');
    assert.equal(res.conflicts[0].resolution, 'error');
  });

  test('formatExplanation generates readable ASCII breakdown with evidence and scores', () => {
    const res = resolver.resolve({
      task: 'Perform security review of nextjs auth endpoints',
      files: ['app/login/page.tsx'],
    });

    const explanation = resolver.formatExplanation(res);
    assert.ok(explanation.includes('ContextOS — Dynamic Skill Resolution'));
    assert.ok(explanation.includes('[DOMAIN: Frontend]'));
    assert.ok(explanation.includes('[PHASE: Review]'));
    assert.ok(explanation.includes('[ROLE: Staff Engineer]'));
    assert.ok(explanation.includes('[RISK: high]'));
    assert.ok(explanation.includes('Selected Skills:'));
    assert.ok(explanation.includes('security'));
    assert.ok(explanation.includes('nextjs'));
  });

  test('CLI contextos resolve supports --explain and --json flags via ctx.js', () => {
    const ctxPath = path.join(rootDir, '.agents', 'ctx.js');

    // Test --explain
    const explainOutput = execFileSync(
      process.execPath,
      [ctxPath, 'resolve', 'security review of nextjs auth', '--files', 'app/login/page.tsx', '--explain'],
      { encoding: 'utf8' }
    );
    assert.ok(explainOutput.includes('ContextOS — Dynamic Skill Resolution'));
    assert.ok(explainOutput.includes('security'));
    assert.ok(explainOutput.includes('score:'));

    // Test --json
    const jsonOutput = execFileSync(
      process.execPath,
      [ctxPath, 'resolve', 'Build accessible modal with react', '--json'],
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(jsonOutput);
    assert.equal(parsed.domain, 'Frontend');
    assert.ok(Array.isArray(parsed.selected));
    assert.ok(parsed.skills.includes('react'));
  });

  test('Workspace Evidence Graph isolates monorepo package signals (Next.js in apps/web vs FastAPI in apps/api)', () => {
    const monorepoResolver = new CanonicalResolver({ rootDir });
    const mockGraph = {
      schemaVersion: 1,
      repositoryRoot: 'c:/mock-repo',
      fingerprint: 'abc123sha',
      partial: false,
      packages: [
        {
          id: 'web',
          root: 'apps/web',
          ecosystem: 'npm',
          manifests: ['apps/web/package.json'],
          dependencies: ['next', 'react', 'typescript'],
          configs: ['apps/web/next.config.js'],
          languages: ['typescript'],
          internalDependencies: []
        },
        {
          id: 'api',
          root: 'apps/api',
          ecosystem: 'python',
          manifests: ['apps/api/requirements.txt'],
          dependencies: ['fastapi', 'uvicorn', 'pydantic'],
          configs: ['apps/api/requirements.txt'],
          languages: ['python'],
          internalDependencies: []
        }
      ],
      evidence: []
    };

    // 1. Task targeting apps/web
    const webRes = monorepoResolver.resolve({
      task: 'Build the profile page',
      files: ['apps/web/page.tsx'],
      workspaceGraph: mockGraph,
    });
    assert.ok(webRes.skills.includes('nextjs'), 'nextjs selected for web task');
    assert.ok(webRes.skills.includes('react'), 'react selected for web task');
    assert.ok(!webRes.skills.includes('fastapi'), 'fastapi NOT selected for web task');

    // 2. Task targeting apps/api
    const apiRes = monorepoResolver.resolve({
      task: 'Add health check endpoint',
      files: ['apps/api/main.py'],
      workspaceGraph: mockGraph,
    });
    assert.ok(apiRes.skills.includes('fastapi'), 'fastapi selected for api task');
    assert.ok(!apiRes.skills.includes('nextjs'), 'nextjs NOT selected for api task');
    assert.ok(!apiRes.skills.includes('react'), 'react NOT selected for api task');
  });
});
