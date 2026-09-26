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
});
