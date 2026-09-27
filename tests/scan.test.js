/**
 * tests/scan.test.js
 * ContextOS Phase 5: Staged Index Scanner Unit & Integration Tests
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { runScan } = require('../bin/lib/scan.js');

const CTX_BIN = path.resolve(__dirname, '../bin/index.js');
const NODE = process.execPath;

test('Phase 5: Staged Index Scanner (scan.test.js)', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-scan-test-'));

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Initialize a mock git repo in tmpDir
  execFileSync('git', ['init'], { cwd: tmpDir });
  execFileSync('git', ['config', 'user.name', 'ContextOS Tester'], { cwd: tmpDir });
  execFileSync('git', ['config', 'user.email', 'test@contextos.dev'], { cwd: tmpDir });

  // Initial commit
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project\n');
  execFileSync('git', ['add', 'README.md'], { cwd: tmpDir });
  execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

  await t.test('Task 5.2 & 5.3: Secret staged in index is caught even if deleted from working tree', () => {
    const secretFile = path.join(tmpDir, 'api_token.js');
    fs.writeFileSync(secretFile, 'const token = "sk-12345678901234567890123456789012";\n');
    execFileSync('git', ['add', 'api_token.js'], { cwd: tmpDir });

    // Delete from working tree WITHOUT git add
    fs.unlinkSync(secretFile);

    const res = runScan({ cwd: tmpDir, enforce: true });
    assert.strictEqual(res.ok, false, 'Staged secret must be caught even if deleted in worktree');
    assert.strictEqual(res.code, 1);
    assert.ok(res.findings.some(f => f.ruleId === 'SEC-006' || f.type.includes('OpenAI')));

    // Cleanup index
    execFileSync('git', ['rm', '--cached', 'api_token.js'], { cwd: tmpDir });
  });

  await t.test('Task 5.2: Unstaged secret in working tree does NOT trigger staged scan failure', () => {
    const untrackedSecret = path.join(tmpDir, 'local_only.js');
    fs.writeFileSync(untrackedSecret, 'const key = "sk-12345678901234567890123456789012";\n');

    // Staged index is clean
    const res = runScan({ cwd: tmpDir, enforce: true });
    assert.strictEqual(res.ok, true, 'Unstaged file must not block clean staged index');
    assert.strictEqual(res.findings.length, 0);

    fs.unlinkSync(untrackedSecret);
  });

  await t.test('Task 5.4: Blocked filenames (.env) are rejected in staged index', () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'DATABASE_URL=postgres://localhost\n');
    execFileSync('git', ['add', '.env'], { cwd: tmpDir });

    const res = runScan({ cwd: tmpDir, enforce: true });
    assert.strictEqual(res.ok, false);
    assert.ok(res.findings.some(f => f.ruleId === 'SEC-000' && f.type === 'Blocked Filename'));

    execFileSync('git', ['rm', '-f', '.env'], { cwd: tmpDir });
  });

  await t.test('Task 5.6: Placeholder stubs in added diff lines are caught', () => {
    const codeFile = path.join(tmpDir, 'service.js');
    fs.writeFileSync(codeFile, 'function processData() {\n  // TODO: implement later\n}\n');
    execFileSync('git', ['add', 'service.js'], { cwd: tmpDir });

    // With placeholders enabled
    const res = runScan({ cwd: tmpDir, placeholders: true, enforce: true });
    assert.strictEqual(res.ok, false);
    assert.ok(res.findings.some(f => f.ruleId === 'CODE-001'));

    // In advisory mode (enforce: false)
    const advisoryRes = runScan({ cwd: tmpDir, placeholders: true, enforce: false });
    assert.strictEqual(advisoryRes.ok, true, 'Advisory mode must return code 0');
    assert.strictEqual(advisoryRes.code, 0);
    assert.strictEqual(advisoryRes.findings.length, 1);

    execFileSync('git', ['rm', '-f', 'service.js'], { cwd: tmpDir });
  });

  await t.test('Task 5.6: Deleted placeholder lines do not trigger new violations', () => {
    // Initial file with placeholder committed previously
    const legacyFile = path.join(tmpDir, 'legacy.js');
    fs.writeFileSync(legacyFile, 'function old() {\n  // TODO: implement later\n}\n');
    execFileSync('git', ['add', 'legacy.js'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'add legacy stub'], { cwd: tmpDir });

    // Now remove the placeholder line
    fs.writeFileSync(legacyFile, 'function old() {\n  return 42;\n}\n');
    execFileSync('git', ['add', 'legacy.js'], { cwd: tmpDir });

    const res = runScan({ cwd: tmpDir, placeholders: true, enforce: true });
    assert.strictEqual(res.ok, true, 'Removing a placeholder must be clean');
    assert.strictEqual(res.findings.length, 0);

    execFileSync('git', ['reset', '--hard', 'HEAD~1'], { cwd: tmpDir });
  });

  await t.test('Task 5.8: Write scope containment enforcement', () => {
    const scopePath = path.join(tmpDir, 'task-scope.json');
    fs.writeFileSync(scopePath, JSON.stringify(['src/**', 'package.json'], null, 2));

    // Stage file within scope
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'console.log("hello");\n');
    execFileSync('git', ['add', 'src/index.js'], { cwd: tmpDir });

    const okScope = runScan({ cwd: tmpDir, scope: 'task-scope.json', enforce: true });
    assert.strictEqual(okScope.ok, true, 'File within scope must pass');

    // Stage file outside scope
    fs.writeFileSync(path.join(tmpDir, 'unauthorized.js'), 'module.exports = {};\n');
    execFileSync('git', ['add', 'unauthorized.js'], { cwd: tmpDir });

    const badScope = runScan({ cwd: tmpDir, scope: 'task-scope.json', enforce: true });
    assert.strictEqual(badScope.ok, false);
    assert.ok(badScope.findings.some(f => f.ruleId === 'SCOPE-001'));

    execFileSync('git', ['rm', '-f', 'unauthorized.js'], { cwd: tmpDir });
    execFileSync('git', ['rm', '-f', 'src/index.js'], { cwd: tmpDir });
    fs.unlinkSync(scopePath);
  });

  await t.test('Task 5.9: CLI execution returns structured JSON and correct exit codes', () => {
    // Clean state
    const cleanOut = execFileSync(NODE, [CTX_BIN, 'scan', '--json'], { cwd: tmpDir, encoding: 'utf8' });
    const cleanJson = JSON.parse(cleanOut);
    assert.strictEqual(cleanJson.ok, true);
    assert.strictEqual(cleanJson.code, 0);

    // Injected violation with --enforce
    const secretFile = path.join(tmpDir, 'secret.js');
    fs.writeFileSync(secretFile, 'const k = "sk-12345678901234567890123456789012";\n');
    execFileSync('git', ['add', 'secret.js'], { cwd: tmpDir });

    let failed = false;
    try {
      execFileSync(NODE, [CTX_BIN, 'scan', '--enforce', '--json'], { cwd: tmpDir, encoding: 'utf8' });
    } catch (err) {
      failed = true;
      assert.strictEqual(err.status, 1);
      const parsed = JSON.parse(err.stdout);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.code, 1);
      assert.ok(parsed.findings.length > 0);
    }
    assert.ok(failed, 'CLI with --enforce must exit code 1 when secret is found');

    execFileSync('git', ['rm', '-f', 'secret.js'], { cwd: tmpDir });
  });

  await t.test('Task 5.15: Scope boundary prevents prefix collision and catches deletions outside scope', () => {
    // 1. Prefix boundary: src-other/evil.js should not match src/**
    fs.mkdirSync(path.join(tmpDir, 'src-other'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src-other', 'evil.js'), 'console.log("evil");\n');
    execFileSync('git', ['add', 'src-other/evil.js'], { cwd: tmpDir });

    const scopePath = path.join(tmpDir, 'boundary-scope.json');
    fs.writeFileSync(scopePath, JSON.stringify({ allowedPaths: ['src/**'] }), 'utf8');

    const prefixResult = runScan({ cwd: tmpDir, scope: 'boundary-scope.json', enforce: true });
    assert.strictEqual(prefixResult.ok, false, 'src-other/evil.js must not match src/**');
    assert.ok(prefixResult.findings.some(f => f.file === 'src-other/evil.js' && f.ruleId === 'SCOPE-001'));

    execFileSync('git', ['rm', '-f', 'src-other/evil.js'], { cwd: tmpDir });

    // 2. Deletion outside scope: deleting protected/config.json when scope is src/**
    fs.mkdirSync(path.join(tmpDir, 'protected'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'protected', 'config.json'), '{"secret":true}\n');
    execFileSync('git', ['add', 'protected/config.json'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'add protected file'], { cwd: tmpDir });

    // Stage deletion
    execFileSync('git', ['rm', 'protected/config.json'], { cwd: tmpDir });

    const deleteResult = runScan({ cwd: tmpDir, scope: 'boundary-scope.json', enforce: true });
    assert.strictEqual(deleteResult.ok, false, 'Deletion of protected/config.json outside scope must fail');
    assert.ok(deleteResult.findings.some(f => f.file === 'protected/config.json' && f.ruleId === 'SCOPE-001'));

    // Reset git state
    execFileSync('git', ['reset', '--hard', 'HEAD'], { cwd: tmpDir });
    fs.unlinkSync(scopePath);
  });

  await t.test('Task 5.16: Staged scanner catches placeholder stubs in Unicode filenames', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    const unicodeFile = path.join(tmpDir, 'src', 'пример.js');
    fs.writeFileSync(unicodeFile, 'function stub() {\n  // TODO: implement later\n}\n', 'utf8');
    execFileSync('git', ['add', 'src/пример.js'], { cwd: tmpDir });

    const scanResult = runScan({ cwd: tmpDir, placeholders: true, enforce: true });
    assert.strictEqual(scanResult.ok, false, 'Scanner must detect placeholder stub in unicode filename');
    assert.ok(scanResult.findings.some(f => f.ruleId === 'CODE-001'), 'CODE-001 rule must trigger for unicode file');

    execFileSync('git', ['rm', '-f', 'src/пример.js'], { cwd: tmpDir });
  });

  await t.test('Task 5.17: Literal pathspecs handle spaces and glob characters in filenames', () => {
    const specialDir = path.join(tmpDir, 'src', 'path with spaces');
    fs.mkdirSync(specialDir, { recursive: true });
    const specialFile = path.join(specialDir, 'test[0].js');
    fs.writeFileSync(specialFile, 'function calc() {\n  // TODO: implement later\n}\n', 'utf8');
    execFileSync('git', ['add', 'src/path with spaces/test[0].js'], { cwd: tmpDir });

    const scanResult = runScan({ cwd: tmpDir, placeholders: true, enforce: true });
    assert.strictEqual(scanResult.ok, false);
    assert.ok(scanResult.findings.some(f => f.file === 'src/path with spaces/test[0].js' && f.ruleId === 'CODE-001'));

    execFileSync('git', ['rm', '-f', 'src/path with spaces/test[0].js'], { cwd: tmpDir });
  });

  await t.test('Task 5.18: Large files (>2MB) fail closed in enforce mode with exact SCAN-SKIP-001 code', () => {
    const largeFile = path.join(tmpDir, 'src', 'large-asset.dat');
    fs.mkdirSync(path.dirname(largeFile), { recursive: true });
    const buffer = Buffer.alloc(2.5 * 1024 * 1024, 'a');
    fs.writeFileSync(largeFile, buffer);
    execFileSync('git', ['add', 'src/large-asset.dat'], { cwd: tmpDir });

    // Strict mode
    const strictResult = runScan({ cwd: tmpDir, enforce: true });
    assert.strictEqual(strictResult.ok, false, 'Large file must fail in enforce mode');
    assert.strictEqual(strictResult.code, 1);
    assert.ok(strictResult.findings.some(f => f.ruleId === 'SCAN-SKIP-001' && f.file === 'src/large-asset.dat'));

    // Advisory mode: does not block commit
    const advisoryResult = runScan({ cwd: tmpDir, enforce: false });
    assert.strictEqual(advisoryResult.ok, true, 'Advisory mode allows commit without blocking');
    assert.strictEqual(advisoryResult.code, 0);

    execFileSync('git', ['rm', '-f', 'src/large-asset.dat'], { cwd: tmpDir });
  });

  await t.test('Task 5.19: Unfinished check / Git error returns exit code 2 in ALL modes', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-non-git-'));
    try {
      // In enforce mode
      const enforceRes = runScan({ cwd: nonGitDir, enforce: true });
      assert.strictEqual(enforceRes.ok, false);
      assert.strictEqual(enforceRes.code, 2, 'Must return code 2 in enforce mode');
      assert.ok(enforceRes.error.includes('Not a Git repository'), 'Must specify failure reason');

      // In advisory mode
      const advisoryRes = runScan({ cwd: nonGitDir, enforce: false });
      assert.strictEqual(advisoryRes.ok, false, 'Must not report ok: true when scan could not complete');
      assert.strictEqual(advisoryRes.code, 2, 'Must return code 2 in advisory mode when scan could not complete');
      assert.ok(advisoryRes.error.includes('Not a Git repository'), 'Must specify failure reason in advisory mode');
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    }
  });

  await t.test('Task 5.22: contextos scan --project targets specified external repository and detects staged secrets', () => {
    const repoA = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-scan-repo-a-'));
    const repoB = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-scan-repo-b-'));

    try {
      execFileSync('git', ['init'], { cwd: repoA });
      execFileSync('git', ['config', 'user.name', 'Repo A'], { cwd: repoA });
      execFileSync('git', ['config', 'user.email', 'a@test.dev'], { cwd: repoA });
      fs.writeFileSync(path.join(repoA, 'file_a.txt'), 'clean repo a\n');
      execFileSync('git', ['add', 'file_a.txt'], { cwd: repoA });
      execFileSync('git', ['commit', '-m', 'init a'], { cwd: repoA });

      execFileSync('git', ['init'], { cwd: repoB });
      execFileSync('git', ['config', 'user.name', 'Repo B'], { cwd: repoB });
      execFileSync('git', ['config', 'user.email', 'b@test.dev'], { cwd: repoB });
      fs.writeFileSync(path.join(repoB, 'file_b.txt'), 'clean repo b\n');
      execFileSync('git', ['add', 'file_b.txt'], { cwd: repoB });
      execFileSync('git', ['commit', '-m', 'init b'], { cwd: repoB });

      // Stage a secret in repoB only
      const secretPath = path.join(repoB, 'staged_secret.js');
      fs.writeFileSync(secretPath, 'const apiKey = "sk-12345678901234567890123456789012";\n');
      execFileSync('git', ['add', 'staged_secret.js'], { cwd: repoB });

      // Run scan from repoA targeting repoB with --project
      let procOutput = '';
      let procStatus = 0;
      try {
        procOutput = execFileSync(NODE, [CTX_BIN, 'scan', '--project', repoB, '--enforce', '--json'], {
          cwd: repoA,
          encoding: 'utf8',
        });
      } catch (err) {
        procStatus = err.status;
        procOutput = (err.stdout || '').toString();
      }

      assert.strictEqual(procStatus, 1, 'Scanner must exit with code 1 when secret is found in targeted project');
      const parsed = JSON.parse(procOutput);
      assert.strictEqual(parsed.code, 1);
      const toCanonical = (p) => {
        try {
          return (fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p)).replace(/\\/g, '/').toLowerCase();
        } catch {
          return path.resolve(p).replace(/\\/g, '/').toLowerCase();
        }
      };
      assert.strictEqual(toCanonical(parsed.gitRoot), toCanonical(repoB), 'gitRoot must be target repository repoB, not invoking repository repoA');
      assert.ok(
        parsed.findings.some(f => f.file === 'staged_secret.js' && f.ruleId === 'SEC-006'),
        'Must detect staged secret in target repoB'
      );
    } finally {
      fs.rmSync(repoA, { recursive: true, force: true });
      fs.rmSync(repoB, { recursive: true, force: true });
    }
  });
});

