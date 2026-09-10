# ContextOS System Architecture

## Core Overview
ContextOS is composed of two primary layers interacting through a unified configuration source:
1. **Canonical TypeScript Core (`contextos-mcp`)**: The engine providing orchestration, routing, execution sandboxes, verification loops, and the Model Context Protocol (MCP) server.
2. **CLI Adapter (`.agents/bin`)**: A lightweight, bundled adapter built from the canonical core using `esbuild`. It serves as the local CLI endpoint for health checks, debugging, and setup.

## Data Flow
```mermaid
graph TD
    A[User Request] --> B{Client (Cursor/Gemini/Claude)}
    B -- MCP Protocol --> C[ContextOS MCP Server]
    C --> D[Task Routing & Planning]
    D --> E[Subagent Orchestration]
    E --> F[Sandbox Execution]
    
    F -- Write Operations --> G[Journaled Transaction]
    G -- Safe Path Check --> H[Project Mutation Lock]
    H -- Commit --> I[Filesystem]
    
    C -- Read Operations --> J[Project Graph]
    J --> K[Context Manager]
```

## Key Components

### 1. Verification & Review
Implemented via a configurable provider pattern (`reviewer-gate.ts`), supporting adversarial checks and mock implementations for testing. All mutations undergo programmatic review before being committed.

### 2. Filesystem Concurrency
- **ProjectMutationLock** (`project-lock.js`): Single-writer inter-process lock using UUID tokens and PID liveness probes.
- **JournaledTransaction** (`journaled-transaction.js`): Provides crash-safe staging, preparation, and rollback for multi-file mutations.
- **Safe Path Primitive** (`safe-path.js`): Blocks UNC, Absolute, Traversal, and ADS path targets.

### 3. Execution Sandbox
- Runs inside OCI containers (Docker/Podman).
- Implements `oci-required`, `oci-preferred`, and `host-unsafe` execution boundaries.
- Mounts limited read-write spaces (e.g. `/tmp:rw,size=64m`) and enforces `cap-drop=ALL`.

### 4. Supply Chain Security
Enforces cryptographic integrity on plugins via `Integrity` checks, downloading and caching verifiable signatures. Floating/unverified sources are blocked by default.
