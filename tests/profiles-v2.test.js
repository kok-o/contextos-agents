/**
 * tests/profiles-v2.test.js
 * Tests for ProfileV2 schema, validation, contradiction checks, and package overrides
 * Uses Node.js built-in test runner (node:test) — zero extra dependencies
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const profiles = require('../.agents/profiles.js');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');

describe('ProfileV2 — Schema, Validation & Monorepo Overrides', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-profilev2-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('parseYamlProfile correctly parses ProfileV2 schema and maps legacy fields', () => {
    const yaml = `
schemaVersion: 2
id: modern-fullstack
name: Modern Fullstack
description: High-speed fullstack profile with strict security and testing.

skills:
  required:
    - security
    - testing
  preferred:
    - react
    - nextjs
    - database
  excluded:
    - ddd
    - microservices

policy:
  verification: required
  review: recommended
  security: required
  adr: off
  testing: required
  accessibility: recommended

generation:
  documents:
    - PRD
    - ARCHITECTURE
    - TASKS

technologyDefaults:
  frontend: react
  meta_framework: nextjs
  database: postgresql
  orm: prisma
`;

    const parsed = profiles.parseYamlProfile(yaml);

    assert.equal(parsed.schemaVersion, 2);
    assert.equal(parsed.id, 'modern-fullstack');
    assert.equal(parsed.name, 'Modern Fullstack');
    assert.deepEqual(parsed.skills.required, ['security', 'testing']);
    assert.deepEqual(parsed.skills.preferred, ['react', 'nextjs', 'database']);
    assert.deepEqual(parsed.skills.excluded, ['ddd', 'microservices']);

    // Policy checks
    assert.equal(parsed.policy.verification, 'required');
    assert.equal(parsed.policy.security, 'required');
    assert.equal(parsed.policy.adr, 'off');

    // Document generation
    assert.deepEqual(parsed.generation.documents, ['PRD', 'ARCHITECTURE', 'TASKS']);

    // Technology defaults
    assert.equal(parsed.technologyDefaults.database, 'postgresql');
    assert.equal(parsed.technologyDefaults.orm, 'prisma');

    // Backward-compat v1 mirror checks
    assert.deepEqual(parsed.prefer_skills, ['react', 'nextjs', 'database']);
    assert.deepEqual(parsed.exclude_skills, ['ddd', 'microservices']);
    assert.deepEqual(parsed.require_skills, ['security', 'testing']);
    assert.deepEqual(parsed.generate_docs, ['PRD', 'ARCHITECTURE', 'TASKS']);
    assert.equal(parsed.defaults.database, 'postgresql');
    assert.equal(parsed.enforce.testing, true);
    assert.equal(parsed.enforce.security_audit, true);
    assert.equal(parsed.enforce.adr, false);
  });

  test('validateProfile detects contradiction when skill is both required and excluded', () => {
    const invalidProfile = {
      id: 'contradictory-profile',
      name: 'Contradictory',
      description: 'Profile with conflicting skill definitions',
      skills: {
        required: ['testing', 'security'],
        preferred: ['react'],
        excluded: ['security', 'microservices'],
      },
      policy: {
        verification: 'required',
        review: 'recommended',
        security: 'required',
      },
    };

    assert.throws(
      () => profiles.validateProfile(invalidProfile),
      (err) => {
        assert.equal(err.code, 'CTX_PROFILE_CONTRADICTION');
        assert.ok(err.message.includes('security'));
        return true;
      }
    );
  });

  test('validateProfile detects contradiction when skill is both preferred and excluded', () => {
    const invalidProfile = {
      id: 'contradictory-pref',
      name: 'Contradictory Preferred',
      description: 'Profile with conflicting skill definitions',
      skills: {
        required: ['testing'],
        preferred: ['database', 'microservices'],
        excluded: ['microservices'],
      },
      policy: {
        verification: 'required',
        review: 'recommended',
        security: 'required',
      },
    };

    assert.throws(
      () => profiles.validateProfile(invalidProfile),
      (err) => {
        assert.equal(err.code, 'CTX_PROFILE_CONTRADICTION');
        assert.ok(err.message.includes('microservices'));
        return true;
      }
    );
  });

  test('validateProfile rejects unknown skill IDs against registry', () => {
    const mockRegistry = {
      skills: {
        security: {},
        testing: {},
        react: {},
      },
    };

    const profileWithFakeSkill = {
      id: 'fake-skills',
      name: 'Fake Skills Profile',
      description: 'Has fictitious skill IDs',
      skills: {
        required: ['security'],
        preferred: ['react', 'imaginary-cloud-mesh'],
        excluded: [],
      },
    };

    assert.throws(
      () => profiles.validateProfile(profileWithFakeSkill, mockRegistry),
      (err) => {
        assert.equal(err.code, 'CTX_PROFILE_UNKNOWN_SKILL');
        assert.ok(err.message.includes('imaginary-cloud-mesh'));
        return true;
      }
    );
  });

  test('validateProfile rejects invalid policy enum values', () => {
    const invalidPolicyProfile = {
      id: 'bad-policy',
      name: 'Bad Policy',
      description: 'Invalid enum value',
      skills: { required: [], preferred: [], excluded: [] },
      policy: {
        verification: 'super-strict-invalid-value',
      },
    };

    assert.throws(
      () => profiles.validateProfile(invalidPolicyProfile),
      (err) => {
        assert.equal(err.code, 'CTX_PROFILE_INVALID_POLICY');
        return true;
      }
    );
  });

  test('explainProfile returns complete structured breakdown and formatProfileExplanation formats text', () => {
    const explanation = profiles.explainProfile('enterprise');
    assert.equal(explanation.id, 'enterprise');
    assert.equal(explanation.name, 'Enterprise');
    assert.ok(explanation.skills.required.includes('security'));
    assert.ok(explanation.skills.required.includes('testing'));
    assert.equal(explanation.policy.verification, 'required');
    assert.equal(explanation.technologyDefaults.database, 'postgresql');

    const formatted = profiles.formatProfileExplanation(explanation);
    assert.ok(formatted.includes('Profile: Enterprise (enterprise)'));
    assert.ok(formatted.includes('Required:  security, testing'));
    assert.ok(formatted.includes('database      : postgresql'));
    assert.ok(formatted.includes('Verification  : required'));
  });

  test('Monorepo package overrides in getActiveProfile and applyProfile', () => {
    const monorepoDir = path.join(tmpDir, 'monorepo-project');
    fs.mkdirSync(path.join(monorepoDir, 'packages', 'web'), { recursive: true });
    fs.mkdirSync(path.join(monorepoDir, 'packages', 'api'), { recursive: true });
    fs.mkdirSync(path.join(monorepoDir, 'packages', 'shared'), { recursive: true });

    // Root package.json
    fs.writeFileSync(path.join(monorepoDir, 'package.json'), JSON.stringify({
      name: 'root-monorepo',
      workspaces: ['packages/*'],
    }));

    // Sub-package manifests
    fs.writeFileSync(path.join(monorepoDir, 'packages', 'web', 'package.json'), JSON.stringify({
      name: '@repo/web',
      dependencies: { react: '^19.0.0', next: '^15.0.0' },
    }));

    fs.writeFileSync(path.join(monorepoDir, 'packages', 'api', 'package.json'), JSON.stringify({
      name: '@repo/api',
      dependencies: { '@nestjs/core': '^10.0.0' },
    }));

    // 1. Apply root profile: enterprise
    profiles.applyProfile('enterprise', monorepoDir);

    // Verify root is enterprise
    const rootActive = profiles.getActiveProfile(monorepoDir);
    assert.equal(rootActive.profile, 'enterprise');

    // 2. Apply package-scoped override for web -> frontend
    profiles.applyProfile('frontend', monorepoDir, { scope: 'packages/web' });

    // 3. Apply package-scoped override for api -> backend
    profiles.applyProfile('backend', monorepoDir, { scope: 'packages/api' });

    // Verify root profile is still enterprise
    const rootAfterOverrides = profiles.getActiveProfile(monorepoDir);
    assert.equal(rootAfterOverrides.profile, 'enterprise');
    assert.equal(rootAfterOverrides.overrides['packages/web'], 'frontend');
    assert.equal(rootAfterOverrides.overrides['packages/api'], 'backend');

    // Verify active profile for a file in web package resolves to frontend
    const webActive = profiles.getActiveProfile(monorepoDir, 'packages/web/src/App.tsx');
    assert.ok(webActive, 'Should resolve active profile for web');
    assert.equal(webActive.profile, 'frontend');
    assert.equal(webActive.isOverride, true);
    assert.equal(webActive.scope, 'packages/web');
    assert.equal(webActive.rootProfile, 'enterprise');
    assert.ok(webActive.exclude_skills.includes('fastapi'));

    // Verify active profile for a file in api package resolves to backend
    const apiActive = profiles.getActiveProfile(monorepoDir, 'packages/api/src/main.ts');
    assert.ok(apiActive, 'Should resolve active profile for api');
    assert.equal(apiActive.profile, 'backend');
    assert.equal(apiActive.isOverride, true);
    assert.equal(apiActive.scope, 'packages/api');
    assert.ok(apiActive.exclude_skills.includes('ui-ux-pro'));

    // Verify file in shared (no override) falls back to root enterprise profile
    const sharedActive = profiles.getActiveProfile(monorepoDir, 'packages/shared/index.ts');
    assert.equal(sharedActive.profile, 'enterprise');
    assert.equal(sharedActive.isOverride, undefined);

    // 4. Remove override for web
    const removedWeb = profiles.removeActiveProfile(monorepoDir, { scope: 'packages/web' });
    assert.equal(removedWeb, true);

    // Web should now fall back to root enterprise
    const webAfterRemove = profiles.getActiveProfile(monorepoDir, 'packages/web/src/App.tsx');
    assert.equal(webAfterRemove.profile, 'enterprise');

    // API override should still exist
    const apiStillActive = profiles.getActiveProfile(monorepoDir, 'packages/api/src/main.ts');
    assert.equal(apiStillActive.profile, 'backend');
  });

  test('CanonicalResolver respects package profile override exclusions', () => {
    const testProject = path.join(tmpDir, 'resolver-override-project');
    const webDir = path.join(testProject, 'apps', 'web');
    fs.mkdirSync(webDir, { recursive: true });

    fs.writeFileSync(path.join(testProject, 'package.json'), JSON.stringify({
      workspaces: ['apps/*'],
    }));

    fs.writeFileSync(path.join(webDir, 'package.json'), JSON.stringify({
      name: 'web-app',
      dependencies: { react: '^18.0.0' },
    }));

    // Root profile: enterprise (allows backend/fastapi)
    profiles.applyProfile('enterprise', testProject);
    // Package override for apps/web: frontend (strictly excludes fastapi, nestjs, microservices)
    profiles.applyProfile('frontend', testProject, { scope: 'apps/web' });

    const resolver = new CanonicalResolver({ rootDir: testProject });

    // Requesting fastapi while touching an apps/web file
    const result = resolver.resolve({
      task: 'Build frontend page with FastAPI client',
      files: ['apps/web/page.tsx'],
      projectDir: testProject,
    });

    // Frontend profile exclusion must suppress fastapi
    assert.ok(!result.skills.includes('fastapi'), 'FastAPI must be excluded by frontend profile override on apps/web');
    assert.ok(result.skills.includes('react'), 'React should be resolved');
  });
});
