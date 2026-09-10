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
