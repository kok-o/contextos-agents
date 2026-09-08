/**
 * tests/safe-writer.test.js
 * Unit tests for bin/lib/safe-writer.js (Task 1.2)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createLockfileData,
  recordManagedFile,
  loadLockfile,
  saveLockfile,
} = require('../bin/lib/lockfile.js');
const {
  planFileWrite,
  executeFileWrite,
  planFileDelete,
  executeFileDelete,
} = require('../bin/lib/safe-writer.js');

describe('bin/lib/safe-writer.js — Safe Atomic File Writer & Conflict Management', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-writer-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('planFileWrite plans CREATE for a new file and updates lockfile upon execution', () => {
    const lock = createLockfileData();
    const relPath = '.agents/core/skills/new-skill/SKILL.md';
    const content = '# New Skill\n';

    const plan = planFileWrite({
      projectDir: tmpDir,
      relPath,
      content,
      lockData: lock,
    });

    assert.equal(plan.action, 'CREATE');
    assert.equal(plan.relPath, relPath);

    const execResult = executeFileWrite(plan, lock);
    assert.equal(execResult.executed, true);
    assert.ok(fs.existsSync(path.join(tmpDir, relPath)));
    assert.equal(fs.readFileSync(path.join(tmpDir, relPath), 'utf8'), content);
    assert.ok(lock.managedFiles[relPath]?.managed);
  });

  test('planFileWrite plans SKIP when clean managed file already has identical content', () => {
    const lock = createLockfileData();
    const relPath = '.agents/ctx.js';
    const content = 'console.log("identical");\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    recordManagedFile(lock, relPath, content);

    const plan = planFileWrite({
      projectDir: tmpDir,
      relPath,
      content,
      lockData: lock,
    });

    assert.equal(plan.action, 'SKIP');
    assert.equal(plan.reason, 'UP_TO_DATE');

    const execResult = executeFileWrite(plan, lock);
    assert.equal(execResult.executed, false);
  });

  test('planFileWrite plans UPDATE when clean managed file content differs', () => {
    const lock = createLockfileData();
    const relPath = '.agents/ctx.js';
    const oldContent = 'console.log("v1");\n';
    const newContent = 'console.log("v2");\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, oldContent);
    recordManagedFile(lock, relPath, oldContent);

    const plan = planFileWrite({
      projectDir: tmpDir,
      relPath,
      content: newContent,
      lockData: lock,
    });

    assert.equal(plan.action, 'UPDATE');

    const execResult = executeFileWrite(plan, lock);
    assert.equal(execResult.executed, true);
    assert.equal(fs.readFileSync(fullPath, 'utf8'), newContent);
    assert.equal(lock.managedFiles[relPath].sha256 !== plan.oldHash, true);
  });

  test('planFileWrite plans CONFLICT on user-modified managed file and writes .contextos.new without overwriting', () => {
    const lock = createLockfileData();
    const relPath = '.agents/core/skills/react/SKILL.md';
    const originalDistribution = '# Original React\n';
    const userModified = '# User Custom React\n';
    const incomingUpdate = '# Incoming React v2\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, userModified);
    recordManagedFile(lock, relPath, originalDistribution);

    const plan = planFileWrite({
      projectDir: tmpDir,
      relPath,
      content: incomingUpdate,
      lockData: lock,
    });

    assert.equal(plan.action, 'CONFLICT');
    assert.equal(plan.reason, 'USER_MODIFIED');

    const execResult = executeFileWrite(plan, lock);
    assert.equal(execResult.executed, true);

    // Original user modification MUST survive untouched
    assert.equal(fs.readFileSync(fullPath, 'utf8'), userModified);

    // Incoming content written to sidecar .contextos.new
    const conflictPath = `${fullPath}.contextos.new`;
    assert.ok(fs.existsSync(conflictPath));
    assert.equal(fs.readFileSync(conflictPath, 'utf8'), incomingUpdate);
  });

  test('planFileWrite plans SKIP when encountering an unmanaged user-created file', () => {
    const lock = createLockfileData();
    const relPath = '.agents/my-custom-tool.js';
    const userContent = 'const custom = true;\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, userContent);

    const plan = planFileWrite({
      projectDir: tmpDir,
      relPath,
      content: 'malicious overwrite\n',
      lockData: lock,
    });

    assert.equal(plan.action, 'SKIP');
    assert.equal(plan.reason, 'UNMANAGED_USER_FILE');

    const execResult = executeFileWrite(plan, lock);
    assert.equal(execResult.executed, false);
    assert.equal(fs.readFileSync(fullPath, 'utf8'), userContent);
  });

  test('dryRun flag prevents any filesystem mutations', () => {
    const lock = createLockfileData();
    const relPath = '.agents/dryrun.txt';

    const plan = planFileWrite({
      projectDir: tmpDir,
      relPath,
      content: 'hello',
      lockData: lock,
    });

    const execResult = executeFileWrite(plan, lock, { dryRun: true });
    assert.equal(execResult.executed, false);
    assert.equal(execResult.dryRun, true);
    assert.equal(fs.existsSync(path.join(tmpDir, relPath)), false);
  });

  test('planFileDelete plans DELETE for clean managed files, and refuses to delete user-modified or unmanaged files', () => {
    const lock = createLockfileData();
    const cleanRel = '.agents/clean.txt';
    const modifiedRel = '.agents/modified.txt';
    const customRel = '.agents/custom.txt';

    const cleanPath = path.join(tmpDir, cleanRel);
    const modPath = path.join(tmpDir, modifiedRel);
    const customPath = path.join(tmpDir, customRel);

    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });
    fs.writeFileSync(cleanPath, 'clean\n');
    fs.writeFileSync(modPath, 'user modified\n');
    fs.writeFileSync(customPath, 'user created\n');

    recordManagedFile(lock, cleanRel, 'clean\n');
    recordManagedFile(lock, modifiedRel, 'original distribution\n');

    // 1. Clean file -> DELETE
    const planClean = planFileDelete({ projectDir: tmpDir, relPath: cleanRel, lockData: lock });
    assert.equal(planClean.action, 'DELETE');
    const execClean = executeFileDelete(planClean, lock);
    assert.equal(execClean.executed, true);
    assert.equal(fs.existsSync(cleanPath), false);
    assert.equal(lock.managedFiles[cleanRel], undefined);

    // 2. User-modified file -> SKIP (Errata: zero data loss protection)
    const planMod = planFileDelete({ projectDir: tmpDir, relPath: modifiedRel, lockData: lock });
    assert.equal(planMod.action, 'SKIP');
    assert.equal(planMod.reason, 'USER_MODIFIED_PRESERVED');
    const execMod = executeFileDelete(planMod, lock);
    assert.equal(execMod.executed, false);
    assert.ok(fs.existsSync(modPath));

    // 3. Unmanaged user-created file -> SKIP
    const planCustom = planFileDelete({ projectDir: tmpDir, relPath: customRel, lockData: lock });
    assert.equal(planCustom.action, 'SKIP');
    assert.equal(planCustom.reason, 'UNMANAGED_USER_FILE');
    const execCustom = executeFileDelete(planCustom, lock);
    assert.equal(execCustom.executed, false);
    assert.ok(fs.existsSync(customPath));
  });
});
