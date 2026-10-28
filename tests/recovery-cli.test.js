'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
// The installed-consumer gate reuses these crash scenarios against the archive's
// own modules and executables, without copying runtime code from the checkout.
const PACKAGE_ROOT = path.resolve(process.env.CONTEXTOS_RECOVERY_TEST_PACKAGE_ROOT || path.join(__dirname, '..'));
const TX_MODULE = path.join(PACKAGE_ROOT, '.agents/filesystem/journaled-transaction.js');
const { JournaledTransaction, TX_STATES } = require(TX_MODULE);

const CTX_BIN = path.join(PACKAGE_ROOT, 'bin/index.js');
const NODE = process.execPath;

for (const executable of [CTX_BIN, path.join(PACKAGE_ROOT, '.agents/ctx.js')]) {
  test(`${path.relative(PACKAGE_ROOT, executable)} explicitly recovers a crashed lock claimant without discarding transaction backups`, t => {
    const root = crashedTransaction(t);
    const modulePath = path.join(PACKAGE_ROOT, '.agents/filesystem/project-lock.js');
    const { ProjectMutationLock } = require(modulePath);
    const lock = new ProjectMutationLock(root);
    fs.mkdirSync(lock.lockDir, { recursive: true });
    fs.writeFileSync(lock.lockPath, JSON.stringify({ token: 'crashed-reap-owner', pid: 99999999 }));
    const crashed = spawnSync(NODE, ['-e', `
      const fs = require('node:fs');
      const { ProjectMutationLock } = require(process.argv[1]);
      const write = fs.writeFileSync;
      fs.writeFileSync = (file, ...args) => {
        const result = write(file, ...args);
        if (String(file).includes('.reap-')) process.exit(73);
        return result;
      };
      new ProjectMutationLock(process.argv[2]).acquire();
    `, modulePath, root], { encoding: 'utf8', timeout: 10000 });
    assert.strictEqual(crashed.status, 73, crashed.stderr);
    const claimPath = lock.recoveryClaimPath('crashed-reap-owner');
    const backupPath = path.join(root, '.agents/.contextos/transactions/tx-crash/backup/0-first.md');
    const journalPath = path.join(root, '.agents/.contextos/transactions/tx-crash/journal.json');
    const journalBefore = fs.readFileSync(journalPath, 'utf8');
    for (const args of [['--unlock'], ['--unlock', '--force', '--resume', 'tx-crash'],
      ['--unlock', '--force', '--list'], ['--unlock', '--force', '--dry-run']]) {
      const refused = spawnSync(NODE, [executable, 'recover', ...args], { cwd: root, encoding: 'utf8' });
      assert.strictEqual(refused.status, 1, refused.stdout + refused.stderr);
      assert.strictEqual(lock.inspect().token, 'crashed-reap-owner');
      assert.ok(fs.existsSync(claimPath));
      assert.strictEqual(fs.readFileSync(journalPath, 'utf8'), journalBefore);
    }
    const cleared = spawnSync(NODE, [executable, 'recover', '--unlock', '--force'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(cleared.status, 0, cleared.stdout + cleared.stderr);
    assert.match(cleared.stdout, /journals and backups were preserved/);
    assert.strictEqual(fs.existsSync(lock.lockPath), false);
    assert.strictEqual(fs.existsSync(claimPath), false);
    assert.strictEqual(fs.readFileSync(journalPath, 'utf8'), journalBefore);
    assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'BEFORE');
    execFileSync(NODE, [executable, 'recover', '--rollback', 'tx-crash'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'BEFORE');
  });
}

test('administrative unlock refuses live lock owners and live recovery claimants', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-unlock-live-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { ProjectMutationLock } = require(path.join(PACKAGE_ROOT, '.agents/filesystem/project-lock.js'));
  const lock = new ProjectMutationLock(root);
  const token = lock.acquire({ command: 'still-writing' });
  let refused = spawnSync(NODE, [CTX_BIN, 'recover', '--unlock', '--force'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /live owner/);
  assert.strictEqual(lock.inspect().token, token);
  lock.release(token);
  fs.writeFileSync(lock.lockPath, JSON.stringify({ token: 'dead-owner-live-claimant', pid: 99999999 }));
  const claimPath = lock.recoveryClaimPath('dead-owner-live-claimant');
  fs.writeFileSync(claimPath, JSON.stringify({ pid: process.pid, hostname: os.hostname() }));
  refused = spawnSync(NODE, [CTX_BIN, 'recover', '--unlock', '--force'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /active lock recovery/);
  assert.strictEqual(lock.inspect().token, 'dead-owner-live-claimant');
  assert.ok(fs.existsSync(claimPath));
  fs.writeFileSync(claimPath, JSON.stringify({ pid: 99999999, hostname: `${os.hostname()}-foreign` }));
  refused = spawnSync(NODE, [CTX_BIN, 'recover', '--unlock', '--force'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /another host/);
  assert.strictEqual(lock.inspect().token, 'dead-owner-live-claimant');
  assert.ok(fs.existsSync(claimPath), 'a foreign-host claimant cannot be assumed dead from a local PID probe');
});

test('administrative unlock refuses a junction to lock state outside the project', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-unlock-junction-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const root = path.join(fixture, 'project');
  const outside = path.join(fixture, 'outside');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(outside, 'locks'), { recursive: true });
  const outsideLock = path.join(outside, 'locks/mutation.lock');
  fs.writeFileSync(outsideLock, JSON.stringify({ token: 'outside', pid: 99999999 }));
  try { fs.symlinkSync(outside, path.join(root, '.agents/.contextos'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (err) { if (err.code === 'EPERM') return t.skip('symlinks unavailable'); throw err; }
  const result = spawnSync(NODE, [CTX_BIN, 'recover', '--unlock', '--force'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /outside|symlink|junction/i);
  assert.strictEqual(JSON.parse(fs.readFileSync(outsideLock, 'utf8')).token, 'outside');
});

function crashedTransaction(t, operation = 'write') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-recovery-crash-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'ctx-recovery-crash-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  if (operation !== 'create') fs.writeFileSync(path.join(root, 'first.md'), 'BEFORE');
  fs.writeFileSync(path.join(root, 'second.md'), 'BEFORE');
  const result = spawnSync(NODE, ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const [modulePath, root, operation] = process.argv.slice(1);
    const { JournaledTransaction } = require(modulePath);
    const tx = new JournaledTransaction(root, 'tx-crash');
    if (operation === 'delete') tx.stageDelete('first.md');
    else tx.stageWrite('first.md', 'AFTER');
    tx.stageWrite('second.md', 'AFTER');
    const method = operation === 'delete' ? 'unlinkSync' : 'renameSync';
    const original = fs[method];
    fs[method] = function(...args) {
      if (operation === 'write-before' && args[1] === path.join(root, 'first.md')) process.exit(73);
      const value = original.apply(fs, args);
      if (args[operation === 'delete' ? 0 : 1] === path.join(root, 'first.md')) process.exit(73);
      return value;
    };
    tx.commit();
  `, TX_MODULE, root, operation], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(result.status, 73, result.stderr);
  assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'BEFORE');
  return root;
}

for (const operation of ['write', 'create', 'delete', 'write-before']) {
  test(`recover --rollback restores a process crash during ${operation}`, t => {
    const root = crashedTransaction(t, operation);
    const stdout = execFileSync(NODE, [CTX_BIN, 'recover', '--rollback', 'tx-crash'], { cwd: root, encoding: 'utf8' });
    assert.match(stdout, /successfully rolled back/);
    if (operation === 'create') assert.strictEqual(fs.existsSync(path.join(root, 'first.md')), false);
    else assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'BEFORE');
    assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'BEFORE');
    assert.deepStrictEqual(JournaledTransaction.listPending(root), []);
  });

  test(`recover --resume completes a process crash during ${operation}`, t => {
    const root = crashedTransaction(t, operation);
    const stdout = execFileSync(NODE, [CTX_BIN, 'recover', '--resume', 'tx-crash'], { cwd: root, encoding: 'utf8' });
    assert.match(stdout, /successfully resumed and committed/);
    if (operation === 'delete') assert.strictEqual(fs.existsSync(path.join(root, 'first.md')), false);
    else assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'AFTER');
    assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'AFTER');
    assert.deepStrictEqual(JournaledTransaction.listPending(root), []);
  });
}

for (const action of ['--rollback', '--resume']) {
  for (const operation of ['write', 'create', 'delete']) {
    test(`${action} recovers a legacy RC1 journal after ${operation}`, t => {
      const root = crashedTransaction(t, operation);
      const journal = path.join(root, '.agents/.contextos/transactions/tx-crash/journal.json');
      const data = JSON.parse(fs.readFileSync(journal, 'utf8'));
      delete data.schemaVersion;
      for (const op of data.operations) {
        delete op.progress;
        delete op.beforeHash;
        delete op.hadExisting;
        op.backupFilePath = null;
      }
      fs.writeFileSync(journal, JSON.stringify(data));
      execFileSync(NODE, [CTX_BIN, 'recover', action, 'tx-crash'], { cwd: root, encoding: 'utf8' });
      const exists = fs.existsSync(path.join(root, 'first.md'));
      assert.strictEqual(exists, action === '--rollback' ? operation !== 'create' : operation !== 'delete');
      if (exists) assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), action === '--rollback' ? 'BEFORE' : 'AFTER');
      assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), action === '--rollback' ? 'BEFORE' : 'AFTER');
    });
  }
}

test('rollback can itself crash and be retried without losing the original backup', t => {
  const root = crashedTransaction(t);
  const result = spawnSync(NODE, ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const [modulePath, root] = process.argv.slice(1);
    const { JournaledTransaction } = require(modulePath);
    const original = fs.renameSync;
    fs.renameSync = function(...args) {
      const value = original.apply(fs, args);
      if (args[1] === path.join(root, 'first.md')) process.exit(74);
      return value;
    };
    JournaledTransaction.load(root, 'tx-crash').rollback();
  `, TX_MODULE, root], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(result.status, 74, result.stderr);
  assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'BEFORE');
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/.contextos/transactions/tx-crash/backup/0-first.md'), 'utf8'), 'BEFORE');
  execFileSync(NODE, [CTX_BIN, 'recover', '--rollback', 'tx-crash'], { cwd: root, encoding: 'utf8' });
  assert.deepStrictEqual(JournaledTransaction.listPending(root), []);
});

test('resume followed by another crash retains both original backups for rollback', t => {
  const root = crashedTransaction(t);
  const result = spawnSync(NODE, ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const [modulePath, root] = process.argv.slice(1);
    const { JournaledTransaction } = require(modulePath);
    const original = fs.renameSync;
    fs.renameSync = function(...args) {
      const value = original.apply(fs, args);
      if (args[1] === path.join(root, 'second.md')) process.exit(74);
      return value;
    };
    JournaledTransaction.load(root, 'tx-crash').commit();
  `, TX_MODULE, root], { encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(result.status, 74, result.stderr);
  execFileSync(NODE, [CTX_BIN, 'recover', '--rollback', 'tx-crash'], { cwd: root, encoding: 'utf8' });
  for (const file of ['first.md', 'second.md']) assert.strictEqual(fs.readFileSync(path.join(root, file), 'utf8'), 'BEFORE');
});

test('resume refuses to overwrite an unstarted file edited after a crash', t => {
  const root = crashedTransaction(t);
  fs.writeFileSync(path.join(root, 'second.md'), 'USER EDIT');
  const result = spawnSync(NODE, [CTX_BIN, 'recover', '--resume', 'tx-crash'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'USER EDIT');
  assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'AFTER');
});

test('resume refuses an ambiguous legacy operation without a precondition', t => {
  const root = crashedTransaction(t);
  const journal = path.join(root, '.agents/.contextos/transactions/tx-crash/journal.json');
  const data = JSON.parse(fs.readFileSync(journal, 'utf8'));
  delete data.schemaVersion;
  for (const op of data.operations) {
    delete op.progress;
    delete op.beforeHash;
    delete op.hadExisting;
    delete op.expectedBeforeHash;
  }
  fs.writeFileSync(journal, JSON.stringify(data));
  fs.writeFileSync(path.join(root, 'second.md'), 'USER EDIT');
  const result = spawnSync(NODE, [CTX_BIN, 'recover', '--resume', 'tx-crash'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /precondition|manual recovery/i);
  assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'USER EDIT');
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/.contextos/transactions/tx-crash/backup/0-first.md'), 'utf8'), 'BEFORE');
  // A rollback can still restore the operations whose backups are known.
  execFileSync(NODE, [CTX_BIN, 'recover', '--rollback', 'tx-crash'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'BEFORE');
  assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'USER EDIT');
});

test('the source CLI uses the same locked crash recovery implementation', t => {
  const root = crashedTransaction(t);
  execFileSync(NODE, [path.join(PACKAGE_ROOT, '.agents/ctx.js'), 'recover', '--continue', 'tx-crash'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'AFTER');
  assert.deepStrictEqual(JournaledTransaction.listPending(root), []);
});

for (const action of ['commit', 'rollback']) {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    test(`${action} preserves an edit during ${code} rename backoff`, t => {
      const root = crashedTransaction(t, action === 'commit' ? 'write-before' : 'write');
      const result = spawnSync(NODE, ['-e', `
        const fs = require('node:fs');
        const path = require('node:path');
        const [modulePath, root, action, code] = process.argv.slice(1);
        const { JournaledTransaction } = require(modulePath);
        const rename = fs.renameSync;
        let failed = false;
        fs.renameSync = function(...args) {
          if (!failed && args[1] === path.join(root, 'first.md')) {
            failed = true;
            fs.writeFileSync(args[1], 'USER EDIT DURING BACKOFF');
            throw Object.assign(new Error('Transient sharing violation'), { code });
          }
          return rename.apply(fs, args);
        };
        JournaledTransaction.load(root, 'tx-crash')[action]();
      `, TX_MODULE, root, action, code], { encoding: 'utf8', timeout: 10000 });
      assert.strictEqual(result.status, 1, result.stderr);
      assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'USER EDIT DURING BACKOFF');
      assert.strictEqual(fs.readFileSync(path.join(root, '.agents/.contextos/transactions/tx-crash/backup/0-first.md'), 'utf8'), 'BEFORE');
      assert.strictEqual(JournaledTransaction.listPending(root).length, 1);
    });
  }
}

test('recovery preserves edits made after the crash and retains backups on refusal', t => {
  const root = crashedTransaction(t);
  fs.writeFileSync(path.join(root, 'first.md'), 'USER EDIT');
  for (const action of ['--resume', '--rollback']) {
    const result = spawnSync(NODE, [CTX_BIN, 'recover', action, 'tx-crash'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(result.status, 1);
    assert.strictEqual(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'USER EDIT');
    assert.strictEqual(fs.readFileSync(path.join(root, '.agents/.contextos/transactions/tx-crash/backup/0-first.md'), 'utf8'), 'BEFORE');
    assert.strictEqual(fs.existsSync(path.join(root, '.agents/.contextos/locks/mutation.lock')), false);
    assert.strictEqual(JournaledTransaction.listPending(root).length, 1);
  }
});

test('Recovery CLI', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-recover-test-'));

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('setup mock project', () => {
    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'initial content');
  });

  await t.test('doctor handles no pending transactions', () => {
    let stdout = '';
    try {
      stdout = execFileSync(NODE, [CTX_BIN, 'doctor'], { cwd: tmpDir, encoding: 'utf8' });
    } catch (err) {
      stdout = (err.stdout || '') + (err.stderr || '');
    }
    assert.doesNotMatch(stdout, /RECOVERY_REQUIRED/);
  });

  await t.test('recover --list shows no pending', () => {
    const stdout = execFileSync(NODE, [CTX_BIN, 'recover', '--list'], { cwd: tmpDir, encoding: 'utf8' });
    assert.match(stdout, /No pending or stuck transactions found/);
  });

  let txId;

  await t.test('create torn transaction (APPLYING state)', () => {
    const tx = new JournaledTransaction(tmpDir);
    tx.stageWrite('test.txt', 'new content');
    tx.stageWrite('new_file.txt', 'hello');
    
    // Manually force it to APPLYING without actually finishing
    tx.prepare();
    tx.state = TX_STATES.APPLYING;
    tx.saveJournal();
    txId = tx.txId;
  });

  await t.test('doctor detects RECOVERY_REQUIRED', () => {
    try {
      execFileSync(NODE, [CTX_BIN, 'doctor'], { cwd: tmpDir, encoding: 'utf8' });
      assert.fail('Doctor should have exited with error');
    } catch (err) {
      assert.match(err.stderr || err.stdout, /RECOVERY_REQUIRED: Found 1 incomplete transaction/);
    }
  });

  await t.test('recover --list displays the torn tx', () => {
    const stdout = execFileSync(NODE, [CTX_BIN, 'recover', '--list'], { cwd: tmpDir, encoding: 'utf8' });
    assert.match(stdout, new RegExp(txId));
    assert.match(stdout, /APPLYING/);
  });

  await t.test('recover --rollback rolls it back', () => {
    const stdout = execFileSync(NODE, [CTX_BIN, 'recover', '--rollback', txId], { cwd: tmpDir, encoding: 'utf8' });
    assert.match(stdout, /successfully rolled back/);
    
    // File should not be created
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'new_file.txt')), false);
    
    // Existing file should be untouched
    assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'test.txt'), 'utf8'), 'initial content');

    // tx journal should show ROLLED_BACK
    const journalPath = path.join(tmpDir, '.agents', '.contextos', 'transactions', txId, 'journal.json');
    const data = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert.strictEqual(data.state, TX_STATES.ROLLED_BACK);
  });

  let txId2;

  await t.test('create another torn transaction (PREPARED state)', () => {
    const tx = new JournaledTransaction(tmpDir);
    tx.stageWrite('new_file.txt', 'hello resume');
    
    tx.prepare();
    txId2 = tx.txId;
  });

  await t.test('recover --resume completes it', () => {
    const stdout = execFileSync(NODE, [CTX_BIN, 'recover', '--resume', txId2], { cwd: tmpDir, encoding: 'utf8' });
    assert.match(stdout, /successfully resumed and committed/);

    // File should be created now
    assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'new_file.txt'), 'utf8'), 'hello resume');
    
    // tx journal should show COMMITTED
    const journalPath = path.join(tmpDir, '.agents', '.contextos', 'transactions', txId2, 'journal.json');
    const data = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert.strictEqual(data.state, TX_STATES.COMMITTED);
  });

  await t.test('doctor handles clean state again', () => {
    let stdout = '';
    try {
      stdout = execFileSync(NODE, [CTX_BIN, 'doctor'], { cwd: tmpDir, encoding: 'utf8' });
    } catch (err) {
      stdout = (err.stdout || '') + (err.stderr || '');
    }
    assert.doesNotMatch(stdout, /RECOVERY_REQUIRED/);
  });
});
