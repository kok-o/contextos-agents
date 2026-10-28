'use strict';

const { JournaledTransaction, TX_STATES } = require('../../.agents/filesystem/journaled-transaction.js');
const { ProjectMutationLock, isPidAlive } = require('../../.agents/filesystem/project-lock.js');
const { resolveManagedPath } = require('../../.agents/filesystem/safe-path.js');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

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

  const isUnlock = args.includes('--unlock');
  if ([isList, rollbackIdx !== -1, resumeIdx !== -1, isUnlock].filter(Boolean).length > 1) {
    console.error(c.red('Choose exactly one recovery action: --list, --rollback, --resume, or --unlock.'));
    process.exit(1);
  }

  if (isUnlock) {
    if (!args.includes('--force') || args.includes('--dry-run')) {
      console.error(c.red('Administrative unlock requires --force and cannot use --dry-run. Stop all ContextOS writers and watchers first, then run contextos recover --unlock --force.'));
      process.exit(1);
    }
    try {
      const lock = new ProjectMutationLock(ROOT);
      resolveManagedPath(lock.projectRoot, path.relative(lock.projectRoot, lock.lockPath));
      const holder = lock.inspect();
      const active = payload => payload && Number.isInteger(payload.pid) && payload.pid > 0 &&
        (!payload.hostname || payload.hostname === os.hostname()) && isPidAlive(payload.pid);
      if (active(holder)) throw new Error(`Refusing to unlock a live owner (PID ${holder.pid}). Stop all ContextOS writers and watchers first.`);
      if (holder?.hostname && holder.hostname !== os.hostname()) {
        throw new Error('Cannot verify a lock owned by another host. Stop its writers and recover the lock on that host.');
      }
      if (typeof holder?.token === 'string' && holder.token) {
        const claimPath = lock.recoveryClaimPath(holder.token);
        let claimant;
        try { claimant = JSON.parse(fs.readFileSync(claimPath, 'utf8')); }
        catch (err) { if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err; }
        if (claimant?.hostname && claimant.hostname !== os.hostname()) {
          throw new Error('Cannot verify lock recovery owned by another host. Stop its writers and recover the lock on that host.');
        }
        if (active(claimant)) throw new Error(`Refusing to interrupt active lock recovery (PID ${claimant.pid}). Stop all ContextOS writers and watchers first.`);
      }
      lock.forceUnlock('Explicit recover --unlock --force after stopping all writers');
      console.log(c.green('✓ Project mutation lock and its recovery claim cleared. Transaction journals and backups were preserved; run contextos recover --list next.'));
      process.exit(0);
    } catch (err) {
      console.error(c.red(`[ERROR] Administrative unlock failed: ${err.message}`));
      process.exit(1);
    }
  }

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

  console.log(c.red('Usage: contextos recover --list | --rollback [txId] | --resume [txId] | --unlock --force'));
  process.exit(1);
}

module.exports = recoverCommand;
