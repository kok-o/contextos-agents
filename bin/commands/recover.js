'use strict';

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
  const ROOT = flags.project || process.cwd();

  const isList = flags.list || args.includes('--list') || args.includes('--status');
  
  const rollbackIdx = args.indexOf('--rollback');
  const txIdRollback = rollbackIdx !== -1 && args[rollbackIdx + 1] && !args[rollbackIdx + 1].startsWith('--') ? args[rollbackIdx + 1] : null;

  const resumeIdx = args.includes('--resume') ? args.indexOf('--resume') : args.indexOf('--continue');
  const txIdResume = resumeIdx !== -1 && args[resumeIdx + 1] && !args[resumeIdx + 1].startsWith('--') ? args[resumeIdx + 1] : null;

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

  if (rollbackIdx !== -1 || resumeIdx !== -1) {
    const action = rollbackIdx !== -1 ? 'rollback' : 'resume';
    const txId = txIdRollback || txIdResume || JournaledTransaction.listPending(ROOT)[0]?.txId;
    if (!txId) {
      console.error(c.red('No pending transactions found to recover.'));
      process.exit(1);
    }
    console.log(c.cyan(`Attempting to ${action} transaction: ${txId}`));
    const projectLock = new ProjectMutationLock(ROOT);
    let lockToken = null;
    let exitCode = 0;
    try {
      lockToken = projectLock.acquire({ command: `recover:${action}` });
      const tx = JournaledTransaction.load(ROOT, txId);
      if (action === 'rollback') tx.rollback();
      else tx.commit();
      console.log(c.green(`✓ Transaction ${txId} successfully ${action === 'rollback' ? 'rolled back' : 'resumed and committed'}.`));
    } catch (err) {
      console.error(c.red(`\n[ERROR] ${action === 'rollback' ? 'Rollback' : 'Resume'} failed: ${err.message}`));
      exitCode = 1;
    } finally {
      if (lockToken) projectLock.release(lockToken);
    }
    process.exit(exitCode);
  }

  console.log(c.red('Usage: contextos recover [--list] [--rollback <txId>] [--resume <txId>]'));
  process.exit(1);
}

module.exports = recoverCommand;
