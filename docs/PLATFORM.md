# ContextOS Core Platform Contract

This document defines the supported environment for the stable `contextos-agents` core package.

## Runtime environment

- **Node.js:** `v22.0.0` or newer.
- **Package manager:** npm. The core CLI is distributed as an npm package.
- **Container runtime:** Not required by the stable core compiler.

## Operating systems

The core test suite runs on Windows, macOS, and Linux in CI. Filesystem behavior is covered by the platform-specific test matrix before release.

## Filesystem boundaries

- Mutations are scoped to the selected project root.
- User-supplied output paths must be relative to the project root; traversal and absolute output paths are rejected.
- Network and UNC paths are unsupported for transactional mutations because filesystem locking guarantees vary across network filesystems.

## Separate and experimental packages

The optional MCP server is distributed separately and remains beta. Runtime execution and OCI sandbox integrations are experimental and are not required for, or guaranteed by, the stable core package. Consult the separate package documentation for their requirements.
