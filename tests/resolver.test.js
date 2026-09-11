'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const resolver = require('../.agents/resolver.js');

describe('resolver.js — Dynamic Skill Resolver & Progressive Index', () => {
  test('buildSkillIndex returns all installed skills with metadata', () => {
    const index = resolver.buildSkillIndex(path.join(__dirname, '..'));
    assert.ok(Array.isArray(index), 'Index should be an array');
    assert.ok(index.length >= 7, `Expected at least 7 skills, got ${index.length}`);

    const precisionSkill = index.find(s => s.name === 'gemini-precision');
    assert.ok(precisionSkill, 'gemini-precision skill should exist in index');
    assert.ok(precisionSkill.description.length > 5, 'Description should be populated');
    assert.ok(precisionSkill.path.includes('SKILL.md'), 'Path should point to SKILL.md');
  });

  test('resolveSkills maps prompt keywords to skills', () => {
    const res = resolver.resolveSkills({ prompt: 'Enforce spec plan build test review ship lifecycle' });
    assert.ok(res.skills.includes('engineering-workflow'));
  });

  test('resolveSkills maps phase and role accurately', () => {
    const resPlan = resolver.resolveSkills({ prompt: 'Design the auth architecture', phase: 'Plan' });
    assert.equal(resPlan.role, 'Architect');
    assert.equal(resPlan.phase, 'Plan');

    const resTest = resolver.resolveSkills({ prompt: 'Run vitest suites', phase: 'Test' });
    assert.equal(resTest.role, 'QA Lead');
  });

  test('formatDeclaration formats output matching ContextOS AGENTS.md format', () => {
    const res = resolver.resolveSkills({ prompt: 'Create UI component' });
    const decl = resolver.formatDeclaration(res);
    assert.ok(decl.includes('[DOMAIN: Frontend]'));
    assert.ok(decl.includes('[PHASE: Build]'));
    assert.ok(decl.includes('[ROLE: Senior Developer]'));
    assert.ok(decl.includes('Skills loaded:'));
  });

  test('resolveSkills filters casual words and caps total skills on ambiguous multi-topic sentence', () => {
    const res = resolver.resolveSkills({
      prompt: 'I need to update the user module and query the index type of the container session token',
    });
    // Context window cap: total skills should be minimal and focused (<= 5)
    assert.ok(res.skills.length <= 5, `Expected <= 5 skills, got ${res.skills.length}: ${res.skills.join(', ')}`);
  });

  test('analyzeImportGraph detects dependencies from package.json and config files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-ast-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            prisma: '^5.0.0',
            '@prisma/client': '^5.0.0',
            next: '^14.0.0',
          },
          devDependencies: {
            vitest: '^1.0.0',
          },
        })
      );
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20\n');

      const signals = resolver.analyzeImportGraph(tmpDir);
      assert.ok(signals.has('database'), 'Should detect prisma as database skill');
      assert.ok(signals.has('nextjs'), 'Should detect next as nextjs skill');
      assert.ok(signals.has('testing'), 'Should detect vitest as testing skill');
      assert.ok(signals.has('docker'), 'Should detect Dockerfile as docker skill');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolveSkills integrates AST signals for empty or generic prompts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-hybrid-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            prisma: '^5.0.0',
          },
        })
      );

      const res = resolver.resolveSkills({
        prompt: 'do some work',
        projectDir: tmpDir,
      });

      assert.ok(res.skills.includes('database'), 'Should activate database via project AST signals');
      assert.ok(res.skills.includes('system-design'), 'Should activate system-design via synergy rule');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolveSkills enforces Intent Precedence: security is not evicted by Next.js stack noise', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-intent-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
            'react-dom': '^18.0.0',
            tailwindcss: '^3.0.0',
            typescript: '^5.0.0',
          },
        })
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), 'module.exports = {};');

      const res = resolver.resolveSkills({
        prompt: 'Исправь авторизацию и проверку JWT токена',
        projectDir: tmpDir,
      });

      // Crucial verification: security MUST be preserved and not evicted by react/nextjs/typescript/ui-ux-pro
      assert.ok(res.skills.includes('security'), 'security must have immunity against eviction by project stack signals');
      assert.ok(res.skills.includes('ponytail-mindset'), 'foundational skills must be present');
      assert.ok(res.skills.includes('engineering-workflow'), 'foundational skills must be present');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolveSkills suppresses ambient UI noise on pure infrastructure tasks (Docker)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-infra-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
            tailwindcss: '^3.0.0',
          },
        })
      );
      fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), 'module.exports = {};');

      const res = resolver.resolveSkills({
        prompt: 'Создай Dockerfile для мультистейдж сборки приложения',
        projectDir: tmpDir,
      });

      assert.ok(res.skills.includes('docker'), 'docker must be activated');
      assert.ok(!res.skills.includes('ui-ux-pro'), 'ui-ux-pro must be suppressed on pure infrastructure task');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolveSkills matches literal "security review" prompt to security skill', () => {
    const res = resolver.resolveSkills({ prompt: 'Perform a security review of the API endpoints' });
    assert.ok(res.skills.includes('security'), 'security must be activated on security review');
  });
});


