'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { JournaledTransaction, TX_STATES } = require('../.agents/filesystem/journaled-transaction.js');

const CTX_BIN = path.resolve(__dirname, '../bin/index.js');
const NODE = process.execPath;

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
    const stdout = execFileSync(NODE, [CTX_BIN, 'doctor'], { cwd: tmpDir, encoding: 'utf8' });
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
    const stdout = execFileSync(NODE, [CTX_BIN, 'doctor'], { cwd: tmpDir, encoding: 'utf8' });
    assert.doesNotMatch(stdout, /RECOVERY_REQUIRED/);
  });
});
