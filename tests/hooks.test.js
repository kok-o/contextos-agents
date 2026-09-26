/**
 * tests/hooks.test.js
 * ContextOS Phase 5: Git Hook Management Unit & Integration Tests
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const CTX_BIN = path.resolve(__dirname, '../bin/index.js');
const NODE = process.execPath;

test('Phase 5: Git Hook Lifecycle & Safety (hooks.test.js)', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-test-'));

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Initialize a mock git repo
  execFileSync('git', ['init'], { cwd: tmpDir });

  await t.test('Task 5.12: Fresh install creates pre-commit hook with isolated block', () => {
    execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: tmpDir });

    const hookFile = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    assert.ok(fs.existsSync(hookFile), 'pre-commit hook file must be created');

    const content = fs.readFileSync(hookFile, 'utf8');
    assert.match(content, /^#!\/bin\/sh/);
    assert.match(content, /# BEGIN CONTEXTOS HOOK/);
    assert.match(content, /contextos-agents scan --staged --enforce/);
    assert.match(content, /# END CONTEXTOS HOOK/);
  });

  await t.test('Task 5.13: Hook installation is idempotent across repeated runs', () => {
    // Run install second time
    execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: tmpDir });

    const hookFile = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const content = fs.readFileSync(hookFile, 'utf8');

    // Count occurrences of HOOK marker
    const occurrences = (content.match(/# BEGIN CONTEXTOS HOOK/g) || []).length;
    assert.strictEqual(occurrences, 1, 'Installation must be idempotent and avoid duplicate blocks');
  });

  await t.test('Task 5.13: Install preserves pre-existing user hooks', () => {
    const hookFile = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const userScript = `#!/bin/sh\necho "Running proprietary user test"\npython -m unittest discover\n`;
    fs.writeFileSync(hookFile, userScript, 'utf8');

    execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: tmpDir });

    const updated = fs.readFileSync(hookFile, 'utf8');
    assert.match(updated, /Running proprietary user test/, 'User test command must be preserved');
    assert.match(updated, /python -m unittest discover/, 'User python test must be preserved');
    assert.match(updated, /# BEGIN CONTEXTOS HOOK/, 'ContextOS block must be present');
  });

  await t.test('Task 5.14: Uninstall removes only ContextOS block and preserves user code', () => {
    const hookFile = path.join(tmpDir, '.git', 'hooks', 'pre-commit');

    execFileSync(NODE, [CTX_BIN, 'hook', 'uninstall'], { cwd: tmpDir });

    assert.ok(fs.existsSync(hookFile), 'Hook file must remain since user commands exist');
    const content = fs.readFileSync(hookFile, 'utf8');
    assert.doesNotMatch(content, /# BEGIN CONTEXTOS HOOK/);
    assert.doesNotMatch(content, /contextos-agents scan/);
    assert.match(content, /Running proprietary user test/);
    assert.match(content, /python -m unittest discover/);
  });

  await t.test('Task 5.14: Uninstall removes empty hook file completely when only ContextOS was present', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-clean-'));
    try {
      execFileSync('git', ['init'], { cwd: freshDir });

      // Install
      execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: freshDir });
      const hookFile = path.join(freshDir, '.git', 'hooks', 'pre-commit');
      assert.ok(fs.existsSync(hookFile));

      // Uninstall
      execFileSync(NODE, [CTX_BIN, 'hook', 'uninstall'], { cwd: freshDir });
      assert.ok(!fs.existsSync(hookFile), 'Hook file must be deleted when no user commands exist');
    } finally {
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });

  await t.test('Task 5.12: Respects core.hooksPath git configuration', () => {
    const customHooksDir = path.join(tmpDir, 'custom-git-hooks');
    execFileSync('git', ['config', 'core.hooksPath', 'custom-git-hooks'], { cwd: tmpDir });

    execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: tmpDir });

    const targetHook = path.join(customHooksDir, 'pre-commit');
    assert.ok(fs.existsSync(targetHook), 'Hook must be installed in core.hooksPath directory');
    const content = fs.readFileSync(targetHook, 'utf8');
    assert.match(content, /# BEGIN CONTEXTOS HOOK/);

    // Uninstall
    execFileSync(NODE, [CTX_BIN, 'hook', 'uninstall'], { cwd: tmpDir });
    assert.ok(!fs.existsSync(targetHook), 'Custom hook file must be cleaned up');

    // Reset git config
    execFileSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: tmpDir });
  });
});
