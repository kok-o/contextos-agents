/**
 * tests/uninstall.test.js
 * Unit tests for Task 1.4b: Safe CLI `uninstall` Command
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('node:child_process');
const { JournaledTransaction, ProjectMutationLock } = require('../.agents/filesystem/index.js');
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

  test('F03 refuses uninstall after a real partial transaction crash, preserving journals and backups', () => {
    const rel = '.agents/project/skills/demo/SKILL.md';
    const full = path.join(tmpProject, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'BEFORE');
    const modulePath = require.resolve('../.agents/filesystem/journaled-transaction.js');
    const crashed = spawnSync(process.execPath, ['-e', `
      const fs = require('node:fs');
      const path = require('node:path');
      const { JournaledTransaction } = require(process.argv[1]);
      const root = process.argv[2];
      const tx = new JournaledTransaction(root, 'tx-pending');
      tx.stageWrite(${JSON.stringify(rel)}, 'AFTER');
      tx.stageWrite('second.md', 'SECOND');
      const rename = fs.renameSync;
      fs.renameSync = function(...args) {
        const result = rename.apply(this, args);
        if (args[1] === path.join(root, ${JSON.stringify(rel)})) process.exit(73);
        return result;
      };
      tx.commit();`, modulePath, tmpProject], { encoding: 'utf8', timeout: 20000 });
    assert.equal(crashed.status, 73, crashed.stderr);
    const tx = JournaledTransaction.load(tmpProject, 'tx-pending');
    const journal = fs.readFileSync(tx.journalPath);
    const backup = path.join(tx.backupDir, '0-SKILL.md');
    const original = fs.readFileSync(backup);
    const lock = createLockfileData();
    recordManagedFile(lock, '.agents/clean.md', 'CLEAN');
    fs.writeFileSync(path.join(tmpProject, '.agents/clean.md'), 'CLEAN');
    saveLockfile(tmpProject, lock);
    const lockBytes = fs.readFileSync(path.join(tmpProject, '.agents/contextos.lock.json'));
    fs.writeFileSync(path.join(tmpProject, '.gitignore'), '# contextos:start\nkeep\n# contextos:end\n');
    const ignoreBytes = fs.readFileSync(path.join(tmpProject, '.gitignore'));
    const result = runUninstall(tmpProject);
    assert.equal(result.ok, false, 'pending transactions must block uninstall');
    assert.equal(result.executed, false);
    assert.equal(result.error, 'CTX_TX_RECOVERY_REQUIRED');
    assert.match(result.message, /recover/i);
    assert.deepEqual(fs.readFileSync(tx.journalPath), journal);
    assert.deepEqual(fs.readFileSync(backup), original);
    assert.deepEqual(fs.readFileSync(path.join(tmpProject, '.agents/contextos.lock.json')), lockBytes);
    assert.deepEqual(fs.readFileSync(path.join(tmpProject, '.gitignore')), ignoreBytes);
    assert.equal(fs.readFileSync(full, 'utf8'), 'AFTER', 'no automatic recovery');
    assert.equal(fs.readFileSync(path.join(tmpProject, '.agents/clean.md'), 'utf8'), 'CLEAN');
    assert.equal(JournaledTransaction.listPending(tmpProject).length, 1);
    JournaledTransaction.load(tmpProject, 'tx-pending').rollback();
    assert.equal(fs.readFileSync(full, 'utf8'), 'BEFORE', 'explicit recovery remains usable');
  });

  test('F03 checks pending transactions after acquiring the mutation lock', () => {
    fs.mkdirSync(path.join(tmpProject, '.agents'));
    const acquire = ProjectMutationLock.prototype.acquire;
    let pending;
    ProjectMutationLock.prototype.acquire = function(...args) {
      const token = acquire.apply(this, args);
      if (args[0]?.command === 'uninstall') {
        pending = new JournaledTransaction(tmpProject, 'tx-after-plan');
        pending.stageWrite('pending.md', 'PENDING');
        pending.prepare();
      }
      return token;
    };
    let result;
    try { result = runUninstall(tmpProject); }
    finally { ProjectMutationLock.prototype.acquire = acquire; }
    assert.equal(result.ok, false);
    assert.equal(result.error, 'CTX_TX_RECOVERY_REQUIRED');
    assert.equal(JournaledTransaction.load(tmpProject, pending.txId).state, 'PREPARED');
    assert.equal(fs.existsSync(path.join(tmpProject, 'pending.md')), false);
    assert.equal(new ProjectMutationLock(tmpProject).isLocked(), false);
  });

  test('F03 removes derived state only while the mutation lock is held', () => {
    const compiled = path.join(tmpProject, '.agents/compiled');
    fs.mkdirSync(compiled, { recursive: true });
    fs.writeFileSync(path.join(compiled, 'cache.json'), '{}');
    const rm = fs.rmSync;
    let checked = false;
    fs.rmSync = function(target, ...args) {
      if (target === compiled) {
        checked = true;
        assert.equal(new ProjectMutationLock(tmpProject).inspect()?.command, 'uninstall');
      }
      return rm.call(this, target, ...args);
    };
    try { assert.equal(runUninstall(tmpProject).ok, true); }
    finally { fs.rmSync = rm; }
    assert.equal(checked, true);
    assert.equal(fs.existsSync(path.join(tmpProject, '.agents')), false);
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
