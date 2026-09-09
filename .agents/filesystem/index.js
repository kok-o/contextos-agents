/**
 * .agents/filesystem/index.js
 * ContextOS Filesystem Safety & Transaction Barrel
 */

const {
  resolveManagedPath,
  toPosix,
  isReservedDeviceName,
  SafePathError,
  ERROR_CODES: SAFE_PATH_ERRORS,
  WINDOWS_RESERVED_NAMES,
} = require('./safe-path.js');

const {
  ProjectMutationLock,
  ProjectLockError,
  ERROR_CODES: LOCK_ERRORS,
  isPidAlive,
} = require('./project-lock.js');

const {
  LockfileV2Manager,
  computeExactHash,
  computeSemanticHash,
  LockfileV2Error,
  ERROR_CODES: LOCKFILE_ERRORS,
  DEFAULT_LOCKFILE_SUBPATH,
} = require('./lockfile-v2.js');

const {
  JournaledTransaction,
  TX_STATES,
  ERROR_CODES: TX_ERRORS,
  TransactionError,
  safeRenameSync,
} = require('./journaled-transaction.js');

module.exports = {
  // Safe Paths
  resolveManagedPath,
  toPosix,
  isReservedDeviceName,
  SafePathError,
  SAFE_PATH_ERRORS,
  WINDOWS_RESERVED_NAMES,

  // Project Locks
  ProjectMutationLock,
  ProjectLockError,
  LOCK_ERRORS,
  isPidAlive,

  // Lockfile v2
  LockfileV2Manager,
  computeExactHash,
  computeSemanticHash,
  LockfileV2Error,
  LOCKFILE_ERRORS,
  DEFAULT_LOCKFILE_SUBPATH,

  // Transactions
  JournaledTransaction,
  TX_STATES,
  TX_ERRORS,
  TransactionError,
  safeRenameSync,
};
