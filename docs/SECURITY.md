# ContextOS Security Threat Model

## Core Philosophy
ContextOS assumes that language models (LLMs) are highly capable but fundamentally untrusted actors. They can hallucinate destructive commands, output vulnerable code, or inadvertently execute path traversal attacks. The execution environment must fail-closed.

## Trust Boundaries

1. **Host Filesystem Boundary**:
   - The LLM cannot write arbitrary files to the host.
   - All filesystem writes must flow through `JournaledTransaction`, which strictly enforces `safe-path.js` constraints.
   - UNC paths, network drives, and path traversals (`../`) are explicitly blocked.

2. **Execution Boundary (Sandbox)**:
   - LLMs cannot execute shell commands directly on the host operating system unless explicitly permitted by user override in `host-unsafe` mode.
   - Code execution defaults to OCI-compliant containers (Docker/Podman).
   - Containers are launched with:
     - `--read-only` root filesystem.
     - `--cap-drop=ALL` and `--security-opt=no-new-privileges`.
     - `--network=none` by default.
     - Ephemeral, isolated `tmpfs` mounts.

3. **Concurrency Boundary**:
   - Multiple agents or processes attempting concurrent modifications are serialized by `ProjectMutationLock`.
   - `ProjectMutationLock` guarantees single-writer semantics and prevents corrupted intermediate states using UUID tokens.

## Known Risks & Acceptances
- **Supply Chain**: Plugin execution requires the supply chain to be cryptographically verifiable. Floating or unpinned plugins are rejected by default.
- **Host-Unsafe Override**: If a user explicitly allows `host-unsafe` mode, the sandbox protections are bypassed. In this state, `AutoMerge` is disabled to ensure a human remains in the loop.

## Defense-in-Depth & Runtime Interception (Action Firewall Synergy)

ContextOS operates as a **deterministic static compiler and pre-commit governance engine**:
- Enforces safe paths and atomic journaled writes on the host filesystem.
- Scans the Git staged index (`contextos scan --staged`) for leaked credentials, blocked files (`.env`), and unfinished lazy stubs prior to commit.
- Runs verification gates in CI (`contextos gate`).

During active model inference and tool execution (in-flight), language models can encounter **indirect prompt injection** (e.g. malicious GitHub issues, poisoned dependency READMEs, or untrusted MCP results) and attempt external data egress or destructive shell commands before any Git commit occurs.

### Recommended Runtime Complement

To achieve complete zero-trust defense across the entire AI engineering lifecycle, ContextOS is designed to complement local runtime action firewalls, such as [Stroq](https://github.com/AGGIB/Stroq):

1. **Static Rules & Context (ContextOS):** Defines and compiles engineering policies, role boundaries, and architectural guidelines into native IDE configurations.
2. **In-Flight Action Firewall (e.g. Stroq):** Intercepts tool calls in real time, monitors taint from untrusted reads, and deterministically denies outbound secret egress (`deny-secret-egress`) or self-tampering of governance files (`deny-self-tamper`).
3. **Commit Governance (ContextOS):** Verifies the Git staged index and prevents dirty commits.
4. **CI/CD Quality Gate (ContextOS):** Verifies adapter parity and rule synchronization.
