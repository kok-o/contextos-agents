/**
 * tests/uninstall.test.js
 * Unit tests for Task 1.4b: Safe CLI `uninstall` Command
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createLockfileData,
  recordManagedFile,
  saveLockfile,
  loadLockfile,
} = require('../bin/lib/lockfile.js');
const {
  planUninstall,
  runUninstall,
} = require('../bin/commands/uninstall.js');

describe('Task 1.4b: Safe CLI uninstall Command', () => {
  let tmpProject;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-uninstall-proj-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpProject, { recursive: true, force: true });
    } catch {}
  });

  test('fails gracefully when .agents directory does not exist in target project', () => {
    const result = planUninstall(tmpProject);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'NO_AGENTS_DIR');
  });

  test('dry-run previews deletions without deleting any files from disk', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });
    const reactContent = '# React v1\nOriginal react skill\n';
    const reactPath = path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md');
    fs.writeFileSync(reactPath, reactContent);

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', reactContent);
    saveLockfile(tmpProject, lock);

    const runRes = runUninstall(tmpProject, { dryRun: true });
    assert.equal(runRes.ok, true);
    assert.equal(runRes.executed, false);
    assert.equal(runRes.summary.delete, 1);

    // Target file must still exist
    assert.ok(fs.existsSync(reactPath));
    assert.ok(fs.existsSync(path.join(projAgents, 'contextos.lock.json')));
  });

  test('clean uninstall deletes all clean managed files and removes .agents directory', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'security'), { recursive: true });

    const reactContent = '# React v1\nOriginal react skill\n';
    const secContent = '# Security v1\nOriginal security skill\n';

    fs.writeFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), reactContent);
    fs.writeFileSync(path.join(projAgents, 'core', 'skills', 'security', 'SKILL.md'), secContent);

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', reactContent);
    recordManagedFile(lock, '.agents/core/skills/security/SKILL.md', secContent);
    saveLockfile(tmpProject, lock);

    const runRes = runUninstall(tmpProject, { dryRun: false });
    assert.equal(runRes.ok, true);
    assert.equal(runRes.executed, true);
    assert.equal(runRes.deletedCount, 2);

    // .agents directory must be completely removed
    assert.equal(fs.existsSync(projAgents), false, '.agents directory should be removed when empty');
  });

  test('preserves user-modified managed file and keeps .agents directory', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'security'), { recursive: true });

    const originalReact = '# React v1\nOriginal react skill\n';
    const modifiedReact = '# React v1\nUser customized this skill!\n';
    const cleanSecurity = '# Security v1\nOriginal clean security skill\n';

    const reactPath = path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md');
    const secPath = path.join(projAgents, 'core', 'skills', 'security', 'SKILL.md');

    fs.writeFileSync(reactPath, modifiedReact);
    fs.writeFileSync(secPath, cleanSecurity);

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', originalReact);
    recordManagedFile(lock, '.agents/core/skills/security/SKILL.md', cleanSecurity);
    saveLockfile(tmpProject, lock);

    const runRes = runUninstall(tmpProject, { dryRun: false });
    assert.equal(runRes.ok, true);
    assert.equal(runRes.summary.skipModified, 1);
    assert.equal(runRes.deletedCount, 1);

    // Clean security skill should be deleted
    assert.equal(fs.existsSync(secPath), false, 'Clean managed security skill should be deleted');

    // Modified react skill MUST NOT be deleted
    assert.ok(fs.existsSync(reactPath), 'User-modified react skill must be preserved');
    assert.equal(fs.readFileSync(reactPath, 'utf8'), modifiedReact);

    // .agents directory MUST still exist
    assert.ok(fs.existsSync(projAgents), '.agents directory must be preserved when user files remain');
  });

  test('preserves unmanaged user custom skills and keeps .agents directory', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });

    // Clean managed skill
    const reactContent = '# React v1\nOriginal react skill\n';
    fs.writeFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), reactContent);

    // Custom user skill
    const customSkillDir = path.join(projAgents, 'core', 'skills', 'my-team-skill');
    fs.mkdirSync(customSkillDir, { recursive: true });
    const customContent = '# My Custom Skill\nProprietary user rules\n';
    const customPath = path.join(customSkillDir, 'SKILL.md');
    fs.writeFileSync(customPath, customContent);

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', reactContent);
    saveLockfile(tmpProject, lock);

    const runRes = runUninstall(tmpProject, { dryRun: false });
    assert.equal(runRes.ok, true);
    assert.equal(runRes.deletedCount, 1);

    // Custom user skill must be intact
    assert.ok(fs.existsSync(customPath), 'User custom skill must be preserved');
    assert.equal(fs.readFileSync(customPath, 'utf8'), customContent);

    // .agents directory MUST still exist
    assert.ok(fs.existsSync(projAgents), '.agents directory must be preserved');
  });
});
