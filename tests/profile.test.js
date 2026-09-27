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

  test('dual-root contract: consumer-unique profile is discovered and applied via projectRoot', () => {
    const consumerRoot = path.join(tmpDir, 'consumer-with-custom-profile');
    const customProfileDir = path.join(consumerRoot, '.agents', 'profiles');
    fs.mkdirSync(customProfileDir, { recursive: true });

    const customProfileYaml = `name: Consumer Proprietary
description: Custom profile defined exclusively in consumer repository
skills:
  required:
    - security
  preferred:
    - testing
`;
    fs.writeFileSync(path.join(customProfileDir, 'consumer-special.yaml'), customProfileYaml, 'utf8');

    // Without consumer root: must NOT be found
    const notFound = profiles.getProfile('consumer-special');
    assert.equal(notFound, null, 'Must not find consumer profile without projectRoot');

    // With consumer root: must be found by getProfile and listProfiles
    const found = profiles.getProfile('consumer-special', consumerRoot);
    assert.ok(found, 'Must find consumer profile when projectRoot is passed');
    assert.equal(found.id, 'consumer-special');
    assert.equal(found.name, 'Consumer Proprietary');

    const allProfiles = profiles.listProfiles(consumerRoot);
    assert.ok(allProfiles.some(p => p.id === 'consumer-special'), 'listProfiles must include consumer-unique profile');

    // Applying consumer-unique profile
    const applied = profiles.applyProfile('consumer-special', consumerRoot);
    assert.equal(applied.profile, 'consumer-special');

    const active = profiles.getActiveProfile(consumerRoot);
    assert.equal(active.profile, 'consumer-special');
  });
});
