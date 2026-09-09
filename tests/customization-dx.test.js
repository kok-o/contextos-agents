/**
 * tests/customization-dx.test.js
 * ContextOS — Customization Layer & DX Test Suite
 *
 * Verifies Milestone 17 (Issue #21):
 *   - Skill customization: override, eject, and diff against upstream (Section 22.2)
 *   - Conflict management: list, show, accept-local, accept-upstream (Section 22.3)
 *   - Privacy-safe diagnostic export bundle (Section 22.6)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  SkillCustomizationManager,
  ConflictManager,
  DiagnosticsExporter,
} = require('../.agents/customization-dx');

function createTempDir(prefix = 'ctx-dx-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('SkillCustomizationManager — override, diff, and eject workflows', (t) => {
  const tmpDir = createTempDir('customization-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // Create upstream core skill
  const upstreamSkillDir = path.join(tmpDir, '.agents', 'core', 'skills', 'my-auth');
  fs.mkdirSync(upstreamSkillDir, { recursive: true });
  fs.writeFileSync(path.join(upstreamSkillDir, 'SKILL.md'), '# Upstream Auth\n', 'utf8');

  const manager = new SkillCustomizationManager(tmpDir);

  // 1. Override
  const overrideRes = manager.override('my-auth');
  assert.equal(overrideRes.success, true);
  const targetFile = path.join(overrideRes.overridePath, 'SKILL.md');
  assert.equal(fs.existsSync(targetFile), true);
  assert.equal(fs.readFileSync(targetFile, 'utf8'), '# Upstream Auth\n');

  // Duplicate override rejected
  assert.throws(
    () => {
      manager.override('my-auth');
    },
    { code: 'CTX_SKILL_OVERRIDE_EXISTS' }
  );

  // 2. Diff (unmodified)
  const diffInitial = manager.diff('my-auth');
  assert.equal(diffInitial.isOverridden, true);
  assert.equal(diffInitial.isDifferent, false);

  // Diff (modified)
  fs.appendFileSync(targetFile, 'Customized rule for our company\n', 'utf8');
  const diffModified = manager.diff('my-auth');
  assert.equal(diffModified.isDifferent, true);

  // 3. Eject
  const ejectSkillDir = path.join(tmpDir, '.agents', 'core', 'skills', 'standalone-tool');
  fs.mkdirSync(ejectSkillDir, { recursive: true });
  fs.writeFileSync(path.join(ejectSkillDir, 'SKILL.md'), '# Standalone\n', 'utf8');

  const ejectRes = manager.eject('standalone-tool');
  assert.equal(ejectRes.success, true);
  assert.equal(fs.existsSync(path.join(ejectRes.ejectedPath, '.ejected')), true);
});

test('ConflictManager — conflict lifecycle (record, show, accept-local, accept-upstream)', (t) => {
  const tmpDir = createTempDir('conflicts-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const manager = new ConflictManager(tmpDir);
  const targetFile = path.join(tmpDir, 'config.json');
  fs.writeFileSync(targetFile, '{"version": 1, "local": true}', 'utf8');

  // Record conflict
  manager.recordConflict({
    id: 'conf-01',
    filePath: 'config.json',
    localContent: '{"version": 1, "local": true}',
    upstreamContent: '{"version": 2, "upstream": true}',
  });

  assert.equal(manager.list().length, 1);
  const conflict = manager.show('conf-01');
  assert.equal(conflict.id, 'conf-01');

  // Accept upstream
  const accepted = manager.acceptUpstream('conf-01');
  assert.equal(accepted, true);
  assert.equal(manager.list().length, 0);
  assert.equal(fs.readFileSync(targetFile, 'utf8'), '{"version": 2, "upstream": true}');
});

test('DiagnosticsExporter — privacy-safe export bundle structure', (t) => {
  const tmpDir = createTempDir('diag-');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"version": "2.0.0"}', 'utf8');
  fs.mkdirSync(path.join(tmpDir, '.agents', 'core', 'skills', 'skill-1'), { recursive: true });

  const bundle = DiagnosticsExporter.exportBundle(tmpDir);

  assert.equal(bundle.schemaVersion, 'contextos-diagnostics-v1');
  assert.equal(bundle.anonymized, true);
  assert.equal(bundle.contextos.packageVersion, '2.0.0');
  assert.equal(bundle.contextos.skillCount, 1);
  assert.ok(bundle.platform.nodeVersion);
  assert.ok(bundle.privacyGuarantee);

  const bundleStr = JSON.stringify(bundle);
  assert.equal(bundleStr.includes('password'), false);
  assert.equal(bundleStr.includes('token'), false);
  assert.equal(bundleStr.includes('secret'), false);
});
