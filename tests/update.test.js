/**
 * tests/update.test.js
 * Unit tests for Task 1.4a: Safe CLI `update` Command
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
  planUpdate,
  runUpdate,
} = require('../bin/commands/update.js');

describe('Task 1.4a: Safe CLI update Command', () => {
  let tmpProject;
  let tmpSource;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-update-proj-'));
    tmpSource = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-update-source-'));

    // Create a mock distribution source in tmpSource/.agents
    const sourceAgents = path.join(tmpSource, '.agents');
    fs.mkdirSync(path.join(sourceAgents, 'core', 'skills', 'react'), { recursive: true });
    fs.mkdirSync(path.join(sourceAgents, 'core', 'skills', 'security'), { recursive: true });

    fs.writeFileSync(
      path.join(sourceAgents, 'core', 'skills', 'react', 'SKILL.md'),
      '# React v2\nUpdated upstream react skill\n'
    );
    fs.writeFileSync(
      path.join(sourceAgents, 'core', 'skills', 'security', 'SKILL.md'),
      '# Security v1\nUpstream security skill\n'
    );
    fs.writeFileSync(
      path.join(sourceAgents, 'AGENTS.md'),
      '# ContextOS v2\nUpdated AGENTS.md\n'
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpProject, { recursive: true, force: true });
      fs.rmSync(tmpSource, { recursive: true, force: true });
    } catch {}
  });

  test('fails gracefully when .agents directory does not exist in target project', () => {
    const result = planUpdate(tmpProject, path.join(tmpSource, '.agents'));
    assert.equal(result.ok, false);
    assert.equal(result.error, 'NO_AGENTS_DIR');
  });

  test('dry-run previews actions without modifying files or lockfile on disk', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });
    fs.writeFileSync(
      path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'),
      '# React v1\nOriginal react skill\n'
    );

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', '# React v1\nOriginal react skill\n');
    saveLockfile(tmpProject, lock);

    const runRes = runUpdate(tmpProject, {
      sourceAgentsDir: path.join(tmpSource, '.agents'),
      dryRun: true,
      skipCompile: true,
    });

    assert.equal(runRes.ok, true);
    assert.equal(runRes.executed, false);

    // Target file must remain at v1
    const content = fs.readFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), 'utf8');
    assert.equal(content.includes('Original react skill'), true);

    // Lockfile must still have v1.0.0
    const loadedLock = loadLockfile(tmpProject);
    assert.equal(loadedLock.version, '1.0.0');
  });

  test('updates clean managed files and creates newly added upstream skills', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });
    const originalReact = '# React v1\nOriginal react skill\n';
    fs.writeFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), originalReact);

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', originalReact);
    saveLockfile(tmpProject, lock);

    const runRes = runUpdate(tmpProject, {
      sourceAgentsDir: path.join(tmpSource, '.agents'),
      dryRun: false,
      skipCompile: true,
      packageVersion: '2.0.0',
    });

    assert.equal(runRes.ok, true);
    assert.equal(runRes.executed, true);

    // react skill should be updated to v2
    const updatedReact = fs.readFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), 'utf8');
    assert.equal(updatedReact.includes('Updated upstream react skill'), true);

    // security skill should be created
    const createdSecurity = fs.readFileSync(path.join(projAgents, 'core', 'skills', 'security', 'SKILL.md'), 'utf8');
    assert.equal(createdSecurity.includes('Upstream security skill'), true);

    // Lockfile should now be version 2.0.0 and track both
    const loadedLock = loadLockfile(tmpProject);
    assert.equal(loadedLock.version, '2.0.0');
    assert.ok(loadedLock.managedFiles['.agents/core/skills/react/SKILL.md']);
    assert.ok(loadedLock.managedFiles['.agents/core/skills/security/SKILL.md']);
  });

  test('preserves user custom skills and unmanaged files without overwriting or deleting', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });
    fs.writeFileSync(
      path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'),
      '# React v1\nOriginal react skill\n'
    );

    // Custom user skill
    const customSkillDir = path.join(projAgents, 'core', 'skills', 'my-team-skill');
    fs.mkdirSync(customSkillDir, { recursive: true });
    const customContent = '# My Custom Skill\nSpecial proprietary instructions\n';
    fs.writeFileSync(path.join(customSkillDir, 'SKILL.md'), customContent);

    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', '# React v1\nOriginal react skill\n');
    saveLockfile(tmpProject, lock);

    runUpdate(tmpProject, {
      sourceAgentsDir: path.join(tmpSource, '.agents'),
      dryRun: false,
      skipCompile: true,
    });

    // Custom skill must be 100% intact
    assert.ok(fs.existsSync(path.join(customSkillDir, 'SKILL.md')));
    assert.equal(fs.readFileSync(path.join(customSkillDir, 'SKILL.md'), 'utf8'), customContent);

    // Custom skill should NOT be recorded as managed
    const loadedLock = loadLockfile(tmpProject);
    assert.equal(loadedLock.managedFiles['.agents/core/skills/my-team-skill/SKILL.md'], undefined);
  });

  test('handles user-customized managed file by generating .contextos.new conflict sidecar', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'react'), { recursive: true });

    const userModifiedContent = '# React v1\nUser added custom rules to react skill\n';
    fs.writeFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), userModifiedContent);

    // Lockfile records original hash from previous installation
    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/react/SKILL.md', '# React v1\nOriginal clean react skill\n');
    saveLockfile(tmpProject, lock);

    const res = runUpdate(tmpProject, {
      sourceAgentsDir: path.join(tmpSource, '.agents'),
      dryRun: false,
      skipCompile: true,
    });

    assert.equal(res.summary.conflict, 1);

    // User's customized react SKILL.md MUST NOT be overwritten
    const currentReact = fs.readFileSync(path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md'), 'utf8');
    assert.equal(currentReact, userModifiedContent);

    // Conflict sidecar must exist with upstream changes
    const sidecarPath = path.join(projAgents, 'core', 'skills', 'react', 'SKILL.md.contextos.new');
    assert.ok(fs.existsSync(sidecarPath), 'Conflict sidecar .contextos.new must be written');
    const sidecarContent = fs.readFileSync(sidecarPath, 'utf8');
    assert.equal(sidecarContent.includes('Updated upstream react skill'), true);
  });

  test('cleans up stale managed files that were removed upstream and cleans parent dirs', () => {
    const projAgents = path.join(tmpProject, '.agents');
    fs.mkdirSync(path.join(projAgents, 'core', 'skills', 'deprecated-skill'), { recursive: true });

    const staleContent = '# Deprecated Skill\nOld instructions\n';
    const staleFilePath = path.join(projAgents, 'core', 'skills', 'deprecated-skill', 'SKILL.md');
    fs.writeFileSync(staleFilePath, staleContent);

    // Record as clean managed file in lockfile
    const lock = createLockfileData({ version: '1.0.0' });
    recordManagedFile(lock, '.agents/core/skills/deprecated-skill/SKILL.md', staleContent);
    saveLockfile(tmpProject, lock);

    const res = runUpdate(tmpProject, {
      sourceAgentsDir: path.join(tmpSource, '.agents'),
      dryRun: false,
      skipCompile: true,
    });

    assert.equal(res.summary.delete, 1);
    assert.equal(fs.existsSync(staleFilePath), false, 'Stale file should be deleted');
    assert.equal(fs.existsSync(path.dirname(staleFilePath)), false, 'Empty directory should be cleaned up');

    const loadedLock = loadLockfile(tmpProject);
    assert.equal(loadedLock.managedFiles['.agents/core/skills/deprecated-skill/SKILL.md'], undefined);
  });
});
