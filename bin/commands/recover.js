'use strict';

const path = require('path');
const { JournaledTransaction, TX_STATES } = require('../../.agents/filesystem/journaled-transaction.js');
const { ProjectMutationLock } = require('../../.agents/filesystem/project-lock.js');

// Minimal ANSI colors
const isTTY = process.stdout.isTTY;
const c = {
  red: (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green: (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  cyan: (s) => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
};

function recoverCommand(args, flags) {
  const ROOT = process.cwd();

  const isList = flags.list || args.includes('--list');
  
  const rollbackIdx = args.indexOf('--rollback');
  const txIdRollback = rollbackIdx !== -1 && args[rollbackIdx + 1] ? args[rollbackIdx + 1] : null;

  const resumeIdx = args.indexOf('--resume');
  const txIdResume = resumeIdx !== -1 && args[resumeIdx + 1] ? args[resumeIdx + 1] : null;

  if (isList) {
    const pending = JournaledTransaction.listPending(ROOT);
    if (pending.length === 0) {
      console.log(c.green('✓ No pending or stuck transactions found.'));
      process.exit(0);
    }
    console.log(c.yellow(`Found ${pending.length} pending/stuck transaction(s):\n`));
    pending.forEach(tx => {
      console.log(`  ID:    ${c.cyan(tx.txId)}`);
      console.log(`  State: ${tx.state === TX_STATES.RECOVERY_REQUIRED ? c.red(tx.state) : c.yellow(tx.state)}`);
      console.log(`  Date:  ${tx.createdAt}`);
      if (tx.error) console.log(`  Error: ${c.red(tx.error)}`);
      console.log('');
    });
    console.log('To recover, run:');
    console.log(`  contextos recover --resume <ID>`);
    console.log(`  contextos recover --rollback <ID>`);
    process.exit(0);
  }

  if (txIdRollback) {
    console.log(c.cyan(`Attempting to rollback transaction: ${txIdRollback}`));
    const projectLock = new ProjectMutationLock(ROOT);
    let lockToken = null;
    try {
      lockToken = projectLock.acquire({ command: 'recover:rollback' });
      const tx = JournaledTransaction.load(ROOT, txIdRollback);
      tx.rollback();
      console.log(c.green(`✓ Transaction ${txIdRollback} successfully rolled back.`));
    } catch (err) {
      console.error(c.red(`\n[ERROR] Rollback failed: ${err.message}`));
      process.exit(1);
    } finally {
      if (lockToken) projectLock.release(lockToken);
    }
    process.exit(0);
  }

  if (txIdResume) {
    console.log(c.cyan(`Attempting to resume transaction: ${txIdResume}`));
    const projectLock = new ProjectMutationLock(ROOT);
    let lockToken = null;
    try {
      lockToken = projectLock.acquire({ command: 'recover:resume' });
      const tx = JournaledTransaction.load(ROOT, txIdResume);
      // Simply calling commit() will resume if it's not COMMITTED/ROLLED_BACK
      tx.commit();
      console.log(c.green(`✓ Transaction ${txIdResume} successfully resumed and committed.`));
    } catch (err) {
      console.error(c.red(`\n[ERROR] Resume failed: ${err.message}`));
      process.exit(1);
    } finally {
      if (lockToken) projectLock.release(lockToken);
    }
    process.exit(0);
  }

  console.log(c.red('Usage: contextos recover [--list] [--rollback <txId>] [--resume <txId>]'));
  process.exit(1);
}

module.exports = recoverCommand;
