# ADR-008: Git Worktree Isolation vs OS-Level Sandboxing

## Status
Accepted

## Context
Subagents performing autonomous coding tasks must be prevented from interfering with developer uncommitted work or dirtying the active Git working tree. However, full operating system sandboxing (e.g. OCI containers, microVMs) incurs startup latency, container runtime dependencies, and platform-specific hurdles on developer laptops.

## Decision
Adopt a phased, defense-in-depth isolation model:
1. **Tier 1 (Base Isolation)**: Git Worktrees with independent temporary indices (`GIT_INDEX_FILE`). Each thread operates in its own worktree and branch (`swarm/<threadId>`).
2. **Tier 2 (Filesystem & Path Scoping)**: Read-only `getDiff()` inspections and strict `write_scope` whitelisting to block `.env` and `.git/` mutations.
3. **Tier 3 (Container Sandbox)**: Optional OCI container sandboxing (Milestone 14) for untrusted environments where arbitrary test code must not touch host network or processes.

## Alternatives Considered
- *Single-directory execution with stash*: High risk of merge conflicts and data loss for developer uncommitted changes.
- *Mandatory Docker for all operations*: Too heavy for simple file-edit workflows and fails when Docker daemon is not running.

## Trade-offs
- Git worktree operations require disk space and brief git command executions.
- Zero risk to developer working tree, fast thread creation (< 500ms), and scalable concurrent subagent tasks.

## Impact
- Implemented in `WorktreeManager` and `contextos-mcp`.
