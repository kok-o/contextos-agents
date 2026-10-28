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

test('F07 applied package-name overrides follow touched files through the real WorkspaceGraph', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-profile-package-id-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.agents/profiles'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['apps/*'] }));
  fs.writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: '@repo/web' }));
  fs.writeFileSync(path.join(root, 'apps/web/index.js'), '// web\n');
  fs.writeFileSync(path.join(root, '.agents/profiles/root-base.yaml'), 'id: root-base\nname: Root base\n');
  fs.writeFileSync(path.join(root, '.agents/profiles/special.yaml'), 'id: special\nname: Special\nexclude_skills: [fastapi]\n');
  const { WorkspaceGraphBuilder } = require('../.agents/workspace/workspace-graph.js');
  const builder = new WorkspaceGraphBuilder();
  const graph = builder.build(root);
  const nearest = builder.findNearestPackage('apps/web/index.js', graph);
  assert.equal(nearest.id, '@repo/web');
  assert.equal(nearest.name, undefined, 'the graph contract exposes id, not name');
  profiles.applyProfile('root-base', root);
  profiles.applyProfile('special', root, { scope: '@repo/web' });
  const saved = JSON.parse(fs.readFileSync(path.join(root, '.agents/profile.json'), 'utf8'));
  assert.equal(saved.overrides['@repo/web'], 'special');
  assert.equal(profiles.getActiveProfile(root, '@repo/web').profile, 'special');
  const registry = { skills: { fastapi: { estimatedTokens: 100 } }, dependencyGraph: { fastapi: [] } };
  const resolver = new CanonicalResolver({ rootDir: root, registry });
  for (const file of ['apps/web/index.js', 'apps\\web\\index.js', path.join(root, 'apps/web/index.js')]) {
    const active = profiles.getActiveProfile(root, file);
    assert.equal(active.profile, 'special', file);
    assert.equal(active.scope, '@repo/web');
    const result = resolver.resolve({ task: 'Use FastAPI', files: [file], installedOnly: true });
    assert.ok(!result.skills.includes('fastapi'), file);
  }
  assert.equal(profiles.getActiveProfile(root, 'other/index.js').profile, 'root-base');
  assert.ok(resolver.resolve({ task: 'Use FastAPI', files: ['other/index.js'], installedOnly: true }).skills.includes('fastapi'));
});

test('CR04 applied directory overrides treat absolute and relative touched paths identically', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-profile-absolute-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['.agents/profiles', '.agents/project/skills/alpha', 'apps/web/src']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['apps/*'] }));
  fs.writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: '@repo/web' }));
  fs.writeFileSync(path.join(root, 'apps/web/src/rule.js'), '// web\n');
  fs.writeFileSync(path.join(root, '.agents/project/skills/alpha/skill.yaml'), JSON.stringify({ id: 'alpha' }));
  fs.writeFileSync(path.join(root, '.agents/project/skills/alpha/SKILL.md'), '# Alpha\n');
  fs.writeFileSync(path.join(root, '.agents/profiles/broad.yaml'), 'id: broad\nname: Broad\n');
  fs.writeFileSync(path.join(root, '.agents/profiles/narrow.yaml'), 'id: narrow\nname: Narrow\nexclude_skills: [alpha]\n');
  profiles.applyProfile('broad', root);
  profiles.applyProfile('broad', root, { scope: 'apps/web' });
  profiles.applyProfile('narrow', root, { scope: 'apps/web/src' });
  const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
  const compiled = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
  const resolver = new CanonicalResolver({ rootDir: root, registry: compiled.registry });
  for (const file of ['apps/web/src/rule.js', 'apps\\web\\src\\rule.js', path.join(root, 'apps/web/src/rule.js'), path.join(root, 'apps/web/src/rule.js').replace(/\\/g, '/')]) {
    const active = profiles.getActiveProfile(root, file);
    assert.equal(active.profile, 'narrow', file);
    assert.equal(active.scope, 'apps/web/src', file);
    assert.deepEqual(resolver.resolve({ task: 'Use alpha', files: [file], installedOnly: true }).skills, [], file);
  }
  assert.equal(profiles.getActiveProfile(root, path.join(root, 'apps/web/src')).profile, 'narrow', 'exact directory match');
  for (const file of ['apps/web/src-other/rule.js', path.join(root, 'apps/web/src-other/rule.js'), path.join(root, 'outside/rule.js')]) {
    assert.equal(profiles.getActiveProfile(root, file).profile, 'broad', file);
    assert.deepEqual(resolver.resolve({ task: 'Use alpha', files: [file], installedOnly: true }).skills, ['alpha'], file);
  }
});

test('nested profile overrides use the most specific scope regardless of insertion order', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-profile-specific-'));
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(root, '.agents/profiles'), { recursive: true });
  for (const id of ['broad', 'narrow']) fs.writeFileSync(path.join(root, `.agents/profiles/${id}.yaml`), `id: ${id}\nname: ${id}\n`);
  for (const entries of [[['packages', 'broad'], ['packages/api', 'narrow']], [['packages/api', 'narrow'], ['packages', 'broad']]]) {
    fs.writeFileSync(path.join(root, '.agents/profile.json'), JSON.stringify({ profile: 'default', overrides: Object.fromEntries(entries) }));
    assert.equal(profiles.getActiveProfile(root, 'packages/api/src/auth.ts').profile, 'narrow');
    assert.equal(profiles.getActiveProfile(root, 'packages/api').profile, 'narrow');
    assert.equal(profiles.getActiveProfile(root, 'packages/api-other/src/index.ts').profile, 'broad');
  }
});

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
