# ADR-006: Journaled Recoverable Transactions vs False Multi-File Atomicity

## Status
Accepted

## Context
Standard POSIX and Windows filesystems do not support true multi-file ACID transactions. Promising "atomic multi-file writes" without journaling leads to corrupted project states when processes crash or when Windows locks files (`EPERM`, `EBUSY`, `EACCES`) midway through an update.

## Decision
Adopt a **Journaled Recoverable Transaction** architecture:
1. Operations follow an explicit state machine: `PLANNED -> PREPARED -> APPLYING -> COMMITTED`.
2. Staged files are written to a temporary staging area on the same filesystem volume.
3. Precondition hashes (`expectedBeforeHash`) are verified prior to mutation.
4. Existing targets are backed up before replacement.
5. In case of error during application, changes are rolled back in reverse order from backup.
6. If a crash occurs mid-flight, the system enters `RECOVERY_REQUIRED`, allowing deterministic rollback or continuation via `contextos recover`.

## Alternatives Considered
- *In-place overwrites*: Highly prone to partial corruption upon process termination.
- *Simple temporary file rename*: Works for a single file, but fails to coordinate multi-file operations across directories.

## Trade-offs
- Additional disk writes for staging and backups during export and updates.
- Guaranteed project recoverability and zero silent corruptions.

## Impact
- Core installer, updater, and adapter exporters execute under transaction control.
