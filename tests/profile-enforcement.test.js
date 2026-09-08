/**
 * tests/profile-enforcement.test.js
 * Tests for .agents/profiles.js and .agents/resolver.js profile enforcement
 * Uses Node.js built-in test runner (node:test) — zero external dependencies
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const profiles = require('../.agents/profiles.js');
const resolver = require('../.agents/resolver.js');

describe('profiles.js & resolver.js — Profile Rule Enforcement', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-enforce-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    profiles.removeActiveProfile(tmpDir);
  });

  test('parseYamlProfile correctly parses enforce and defaults maps', () => {
    const yaml = `
id: custom-test
name: Custom Test Profile
description: A profile with enforce and defaults
exclude_skills:
  - ddd
  - microservices
prefer_skills:
  - database
  - security
enforce:
  adr: true
  testing: true
  security_audit: true
  code_review: false
defaults:
  architecture: modular-monolith
  database: postgresql
  auth: jwt
`;
    const parsed = profiles.parseYamlProfile(yaml);
    assert.equal(parsed.id, 'custom-test');
    assert.deepEqual(parsed.exclude_skills, ['ddd', 'microservices']);
    assert.deepEqual(parsed.prefer_skills, ['database', 'security']);
    assert.equal(parsed.enforce.adr, true);
    assert.equal(parsed.enforce.testing, true);
    assert.equal(parsed.enforce.security_audit, true);
    assert.equal(parsed.enforce.code_review, false);
    assert.equal(parsed.defaults.architecture, 'modular-monolith');
    assert.equal(parsed.defaults.database, 'postgresql');
  });

  test('applyProfile persists enforce and defaults into profile.json', () => {
    const projectDir = path.join(tmpDir, 'project-enterprise');
    fs.mkdirSync(projectDir, { recursive: true });

    profiles.applyProfile('enterprise', projectDir);
    const active = profiles.getActiveProfile(projectDir);

    assert.ok(active, 'Active profile should be retrieved');
    assert.equal(active.profile, 'enterprise');
    assert.ok(active.enforce, 'Enforce rules should be persisted');
    assert.equal(active.enforce.adr, true);
    assert.equal(active.enforce.testing, true);
    assert.ok(active.defaults, 'Defaults should be persisted');
    assert.equal(active.defaults.architecture, 'microservices');
  });

  test('resolveSkills strictly excludes skills forbidden by active profile (MVP profile)', () => {
    const projectDir = path.join(tmpDir, 'project-mvp');
    fs.mkdirSync(projectDir, { recursive: true });

    // Apply MVP profile which excludes microservices, ddd, system-design
    profiles.applyProfile('mvp', projectDir);

    // Prompt explicitly requests microservices and DDD
    const result = resolver.resolveSkills({
      prompt: 'Build microservices architecture using DDD aggregates and system design',
      projectDir,
    });

    assert.ok(!result.skills.includes('microservices'), 'MVP profile must strictly exclude microservices');
    assert.ok(!result.skills.includes('ddd'), 'MVP profile must strictly exclude ddd');
    assert.ok(!result.skills.includes('system-design'), 'MVP profile must strictly exclude system-design');
  });

  test('resolveSkills enforces testing skill when enforce.testing is true', () => {
    const projectDir = path.join(tmpDir, 'project-enforce-test');
    fs.mkdirSync(projectDir, { recursive: true });

    // Apply enterprise profile where enforce.testing is true
    profiles.applyProfile('enterprise', projectDir);

    const result = resolver.resolveSkills({
      prompt: 'Refactor user profile avatar display',
      phase: 'Build',
      projectDir,
    });

    assert.ok(result.skills.includes('testing'), 'Enforce.testing must guarantee testing skill presence');
  });

  test('resolveSkills enforces decisions (ADR) skill when enforce.adr is true during Plan phase', () => {
    const projectDir = path.join(tmpDir, 'project-enforce-adr');
    fs.mkdirSync(projectDir, { recursive: true });

    // Apply enterprise profile where enforce.adr is true
    profiles.applyProfile('enterprise', projectDir);

    const result = resolver.resolveSkills({
      prompt: 'Plan new notification pipeline',
      phase: 'Plan',
      projectDir,
    });

    assert.ok(result.skills.includes('decisions'), 'Enforce.adr must include decisions skill in Plan phase');
  });

  test('resolveSkills boosts skills in prefer_skills', () => {
    const projectDir = path.join(tmpDir, 'project-prefer');
    fs.mkdirSync(projectDir, { recursive: true });

    // Apply backend profile which prefers node, performance, security
    profiles.applyProfile('backend', projectDir);

    const result = resolver.resolveSkills({
      prompt: 'Implement background processor with fast throughput',
      projectDir,
    });

    assert.ok(result.skills.includes('performance'), 'Preferred performance skill should be resolved');
  });
});
