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
    assert.ok(index.length >= 24, `Expected at least 24 skills, got ${index.length}`);

    const reactSkill = index.find(s => s.name === 'react');
    assert.ok(reactSkill, 'React skill should exist in index');
    assert.ok(reactSkill.description.length > 5, 'Description should be populated');
    assert.ok(reactSkill.path.includes('SKILL.md'), 'Path should point to SKILL.md');
  });

  test('resolveSkills maps frontend UI prompts to frontend skills', () => {
    const res = resolver.resolveSkills({ prompt: 'Build a responsive accessible modal dialog with React and Tailwind' });
    assert.equal(res.domain, 'Frontend');
    assert.ok(res.skills.includes('react'));
    assert.ok(res.skills.includes('ui-ux-pro'));
    assert.ok(res.skills.includes('web-accessibility'));
    assert.ok(res.skills.includes('ponytail-mindset'));
  });

  test('resolveSkills maps Next.js files to Next.js skills', () => {
    const res = resolver.resolveSkills({
      prompt: 'Refactor user profile',
      files: ['app/dashboard/profile/page.tsx'],
    });
    assert.ok(res.skills.includes('nextjs'));
    assert.ok(res.skills.includes('react'));
    assert.ok(res.skills.includes('typescript'));
  });

  test('resolveSkills maps database and SQL tasks to database skills', () => {
    const res = resolver.resolveSkills({
      prompt: 'Write a migration for PostgreSQL database and create Prisma models',
      files: ['prisma/schema.prisma'],
    });
    assert.equal(res.domain, 'Backend');
    assert.ok(res.skills.includes('database'));
    assert.ok(res.skills.includes('system-design'));
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

  test('resolveSkills maps graphify prompt and files with system-design synergy', () => {
    const res = resolver.resolveSkills({
      prompt: 'Map the codebase with graphify and analyze blast radius',
      files: ['graph.json'],
    });
    assert.ok(res.skills.includes('graphify'));
    assert.ok(res.skills.includes('system-design'));
    assert.ok(res.skills.includes('ponytail-mindset'));
  });

  test('resolveSkills resolves Russian prompts accurately', () => {
    const res = resolver.resolveSkills({
      prompt: 'создай модальное окно авторизации и напиши юнит-тесты',
    });
    assert.equal(res.domain, 'Frontend');
    assert.ok(res.skills.includes('react'));
    assert.ok(res.skills.includes('ui-ux-pro'));
    assert.ok(res.skills.includes('security'));
    assert.ok(res.skills.includes('testing'));
  });

  test('resolveSkills enforces negative boundaries and does not over-activate irrelevant skills', () => {
    const res = resolver.resolveSkills({
      prompt: 'Refactor button styles and add tailwind gradient animations to the modal dialog',
    });
    assert.ok(res.skills.includes('ui-ux-pro'));
    // Negative checks: unrelated heavy backend skills must NOT be activated
    assert.ok(!res.skills.includes('docker'), 'docker should not activate on UI task');
    assert.ok(!res.skills.includes('database'), 'database should not activate on UI task');
    assert.ok(!res.skills.includes('nestjs'), 'nestjs should not activate on UI task');
    assert.ok(!res.skills.includes('fastapi'), 'fastapi should not activate on UI task');
  });

  test('resolveSkills filters casual words and caps total skills on ambiguous multi-topic sentence', () => {
    const res = resolver.resolveSkills({
      prompt: 'I need to update the user module and query the index type of the container session token',
    });
    // Should NOT blindly activate docker (from container), nestjs (from module), or typescript (from type)
    assert.ok(!res.skills.includes('docker'), 'docker should not trigger on casual "container" mention');
    assert.ok(!res.skills.includes('nestjs'), 'nestjs should not trigger on casual "module" mention');
    assert.ok(!res.skills.includes('typescript'), 'typescript should not trigger on casual "type" mention');
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
});

