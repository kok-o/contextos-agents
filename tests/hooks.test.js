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
    assert.match(content, /scan --staged --enforce/);
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

  await t.test('Task 5.20: Upgrades legacy v2.1.0 trailing hook block to execute before pre-existing exit 0', () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-legacy-'));
    try {
      execFileSync('git', ['init'], { cwd: legacyDir });
      const hookFile = path.join(legacyDir, '.git', 'hooks', 'pre-commit');

      // Emulate v2.1.0 installation: user script ending in exit 0, followed by old block
      const v210Hook = `#!/bin/sh
echo "user pre-commit check"
exit 0

# BEGIN CONTEXTOS HOOK
npx contextos-agents scan --staged --enforce || exit 1
# END CONTEXTOS HOOK
`;
      fs.writeFileSync(hookFile, v210Hook, 'utf8');

      // Run upgrade install
      execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: legacyDir });

      const upgraded = fs.readFileSync(hookFile, 'utf8');
      const startIdx = upgraded.indexOf('# BEGIN CONTEXTOS HOOK');
      const endIdx = upgraded.indexOf('# END CONTEXTOS HOOK');
      const exit0Idx = upgraded.indexOf('exit 0');

      assert.ok(startIdx !== -1, 'ContextOS block must exist');
      assert.ok(exit0Idx !== -1, 'User exit 0 must be preserved');
      assert.ok(startIdx < exit0Idx, 'ContextOS hook must be positioned BEFORE user exit 0 after upgrade');
      assert.ok(endIdx < exit0Idx, 'ContextOS hook end must be positioned BEFORE user exit 0');
    } finally {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  });

  await t.test('Task 5.21: Rejects installation on non-shell shebang (python/node)', () => {
    const nonShellDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-nonshell-'));
    try {
      execFileSync('git', ['init'], { cwd: nonShellDir });
      const hookFile = path.join(nonShellDir, '.git', 'hooks', 'pre-commit');

      fs.writeFileSync(hookFile, '#!/usr/bin/env python\nimport sys\nsys.exit(0)\n', 'utf8');

      let failed = false;
      try {
        execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: nonShellDir, stdio: 'pipe' });
      } catch (err) {
        failed = true;
        assert.strictEqual(err.status, 1);
        const stderr = err.stderr.toString('utf8');
        assert.ok(stderr.includes('requires POSIX shell'), 'Must state POSIX shell requirement');
      }
      assert.ok(failed, 'Must fail closed when non-shell interpreter is detected');
    } finally {
      fs.rmSync(nonShellDir, { recursive: true, force: true });
    }
  });

  await t.test('Task 5.23: Hook blocks commit with error when local runner is absent', () => {
    const noRunnerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-norunner-'));
    try {
      execFileSync('git', ['init'], { cwd: noRunnerDir });
      execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: noRunnerDir });
      execFileSync('git', ['config', 'user.email', 'tester@test.com'], { cwd: noRunnerDir });

      // Install hook
      execFileSync(NODE, [CTX_BIN, 'hook', 'install'], { cwd: noRunnerDir });

      // Stage a file
      fs.writeFileSync(path.join(noRunnerDir, 'file.txt'), 'hello');
      execFileSync('git', ['add', 'file.txt'], { cwd: noRunnerDir });

      let commitFailed = false;
      let output = '';
      try {
        execFileSync('git', ['commit', '-m', 'test commit'], {
          cwd: noRunnerDir,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err) {
        commitFailed = true;
        output = (err.stderr || err.stdout || '').toString();
      }

      assert.ok(commitFailed, 'Commit must be blocked when local runner is not installed');
      assert.ok(
        output.includes('ContextOS local runner not found'),
        'Must output explicit diagnostic about missing local runner'
      );
    } finally {
      fs.rmSync(noRunnerDir, { recursive: true, force: true });
    }
  });
});
