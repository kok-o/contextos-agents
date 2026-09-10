# ContextOS Platform Contract

This document defines the strictly supported environments and boundaries for ContextOS v2.

## Runtime Environment
- **Node.js**: Minimum `v18.0.0` for Core adapters. Minimum `v20.0.0` for MCP Runtime Server (optimal). 
- **Package Manager**: npm, yarn, pnpm supported. ContextOS CLI bundles `esbuild` for zero-dependency generation.

## Operating Systems
- **Windows**: Supported (10/11, Windows Server 2022+). Full support for NTFS constraints.
- **macOS**: Supported (12+).
- **Linux**: Supported (Ubuntu 22.04+, Debian 11+, RHEL 9+). Mandatory for OCI execution isolation.

## Filesystem Constraints
- **UNC/Network Paths**: STRICTLY PROHIBITED. ContextOS mutations via `JournaledTransaction` and `ProjectMutationLock` will return `UNSUPPORTED` on network drives to prevent distributed race conditions and locking failures.
- **Path Traversal**: Any attempt to manipulate files outside of the resolved workspace root via relative paths (`../`) is structurally rejected by the `safe-path.js` primitive.
- **Absolute Paths**: Denied by `safe-path.js`. All operations must be strictly relative to the project root.

## Execution Isolation (Sandbox)
- **OCI Containers**: Docker (API v1.40+) or Podman (v4.0+). 
- **Mode Options**:
  - `oci-required`: All code executions run inside containers.
  - `oci-preferred`: Attempts container execution, fails closed if engine is unavailable.
  - `host-unsafe`: Runs directly on the host (with user confirmation required). Auto-merge is blocked in this mode.
