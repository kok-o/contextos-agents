/**
 * tests/safe-writer.test.js
 * Unit tests for bin/lib/safe-writer.js: conflict planning for installed files.
 *
 * The module plans and never writes; applying plans is covered by the update and
 * uninstall tests, which run them through the journaled transaction.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createLockfileData,
  recordManagedFile,
} = require('../bin/lib/lockfile.js');
const safeWriter = require('../bin/lib/safe-writer.js');
const { planFileWrite, planFileDelete } = safeWriter;

describe('bin/lib/safe-writer.js — conflict planning', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-writer-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('the module exposes planning only, so every write goes through the journaled transaction', () => {
    assert.deepEqual(Object.keys(safeWriter).sort(), ['planFileDelete', 'planFileWrite']);
  });

  test('planning never touches the disk', () => {
    const lock = createLockfileData();
    const relPath = '.agents/core/skills/new-skill/SKILL.md';
    const plan = planFileWrite({ projectDir: tmpDir, relPath, content: '# New Skill\n', lockData: lock });

    assert.equal(plan.action, 'CREATE');
    assert.equal(plan.relPath, relPath);
    assert.equal(plan.newContent, '# New Skill\n');
    assert.equal(fs.existsSync(path.join(tmpDir, '.agents')), false);
    assert.deepEqual(lock.managedFiles, {});
  });

  test('planFileWrite plans SKIP when clean managed file already has identical content', () => {
    const lock = createLockfileData();
    const relPath = '.agents/ctx.js';
    const content = 'console.log("identical");\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    recordManagedFile(lock, relPath, content);

    const plan = planFileWrite({ projectDir: tmpDir, relPath, content, lockData: lock });

    assert.equal(plan.action, 'SKIP');
    assert.equal(plan.reason, 'UP_TO_DATE');
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

    const plan = planFileWrite({ projectDir: tmpDir, relPath, content: newContent, lockData: lock });

    assert.equal(plan.action, 'UPDATE');
    assert.equal(plan.newContent, newContent);
    assert.notEqual(plan.newHash, plan.oldHash);
    assert.equal(fs.readFileSync(fullPath, 'utf8'), oldContent, 'planning leaves the file as it was');
  });

  test('planFileWrite plans CONFLICT on a user-modified managed file and leaves it untouched', () => {
    const lock = createLockfileData();
    const relPath = '.agents/core/skills/react/SKILL.md';
    const userModified = '# User Custom React\n';
    const incomingUpdate = '# Incoming React v2\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, userModified);
    recordManagedFile(lock, relPath, '# Original React\n');

    const plan = planFileWrite({ projectDir: tmpDir, relPath, content: incomingUpdate, lockData: lock });

    assert.equal(plan.action, 'CONFLICT');
    assert.equal(plan.reason, 'USER_MODIFIED');
    assert.equal(plan.conflictPath, `${relPath}.contextos.new`);
    assert.equal(plan.newContent, incomingUpdate);
    assert.equal(fs.readFileSync(fullPath, 'utf8'), userModified);
    assert.equal(fs.existsSync(`${fullPath}.contextos.new`), false);
  });

  test('planFileWrite plans SKIP when encountering an unmanaged user-created file', () => {
    const lock = createLockfileData();
    const relPath = '.agents/my-custom-tool.js';
    const userContent = 'const custom = true;\n';

    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, userContent);

    const plan = planFileWrite({ projectDir: tmpDir, relPath, content: 'malicious overwrite\n', lockData: lock });

    assert.equal(plan.action, 'SKIP');
    assert.equal(plan.reason, 'UNMANAGED_USER_FILE');
    assert.equal(fs.readFileSync(fullPath, 'utf8'), userContent);
  });

  test('planFileDelete plans DELETE for clean managed files, and refuses to delete user-modified or unmanaged files', () => {
    const lock = createLockfileData();
    const cleanRel = '.agents/clean.txt';
    const modifiedRel = '.agents/modified.txt';
    const customRel = '.agents/custom.txt';

    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, cleanRel), 'clean\n');
    fs.writeFileSync(path.join(tmpDir, modifiedRel), 'user modified\n');
    fs.writeFileSync(path.join(tmpDir, customRel), 'user created\n');

    recordManagedFile(lock, cleanRel, 'clean\n');
    recordManagedFile(lock, modifiedRel, 'original distribution\n');

    const planClean = planFileDelete({ projectDir: tmpDir, relPath: cleanRel, lockData: lock });
    assert.equal(planClean.action, 'DELETE');

    const planMod = planFileDelete({ projectDir: tmpDir, relPath: modifiedRel, lockData: lock });
    assert.equal(planMod.action, 'SKIP');
    assert.equal(planMod.reason, 'USER_MODIFIED_PRESERVED');

    const planCustom = planFileDelete({ projectDir: tmpDir, relPath: customRel, lockData: lock });
    assert.equal(planCustom.action, 'SKIP');
    assert.equal(planCustom.reason, 'UNMANAGED_USER_FILE');

    for (const rel of [cleanRel, modifiedRel, customRel]) {
      assert.ok(fs.existsSync(path.join(tmpDir, rel)), `${rel} must survive planning`);
    }
  });
});
