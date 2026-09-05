'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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
});
