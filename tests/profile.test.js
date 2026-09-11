/**
 * tests/profile.test.js
 * Tests for .agents/profiles.js — Profile system and stack detection
 * Uses Node.js built-in test runner (node:test) — zero extra dependencies
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const profiles = require('../.agents/profiles.js');
const { collectSkillDirectories } = require('../.agents/adapters/shared.js');

describe('profiles.js — profile management & detection', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-profile-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    profiles.removeActiveProfile();
  });

  test('listProfiles returns available profiles', () => {
    const list = profiles.listProfiles();
    assert.ok(list.length >= 1, `Expected at least 1 profile, got ${list.length}`);
    const ids = list.map(p => p.id);
    assert.ok(ids.includes('init'), 'Should include init profile');
  });

  test('getProfile returns expected profile structure', () => {
    const initProf = profiles.getProfile('init');
    assert.ok(initProf, 'Init profile should exist');
    assert.equal(initProf.id, 'init');
  });

  test('detectStack identifies React/Next.js and suggests init profile', () => {
    const projectDir = path.join(tmpDir, 'next-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: {
        'next': '^14.0.0',
        'react': '^18.0.0',
        'tailwindcss': '^3.0.0'
      }
    }));

    const result = profiles.detectStack(projectDir);
    assert.ok(result.detected.includes('Next.js'));
    assert.ok(result.detected.includes('Tailwind CSS'));
    assert.equal(result.recommendedProfile, 'init');
  });

  test('detectStack identifies Python stack', () => {
    const projectDir = path.join(tmpDir, 'py-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'fastapi\nuvicorn\n');

    const result = profiles.detectStack(projectDir);
    assert.ok(result.detected.includes('Python'));
    assert.equal(result.recommendedProfile, 'init');
  });

  test('applyProfile and removeActiveProfile manage .agents/profile.json lock', () => {
    const targetProject = path.join(tmpDir, 'lock-project');
    fs.mkdirSync(targetProject, { recursive: true });

    const applied = profiles.applyProfile('init', targetProject);
    assert.equal(applied.profile, 'init');

    const active = profiles.getActiveProfile(targetProject);
    assert.ok(active, 'Active profile should exist');
    assert.equal(active.profile, 'init');

    const removed = profiles.removeActiveProfile(targetProject);
    assert.equal(removed, true);
    assert.equal(profiles.getActiveProfile(targetProject), null);
  });
});
