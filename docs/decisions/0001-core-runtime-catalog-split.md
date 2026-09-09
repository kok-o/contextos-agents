# ADR-001: Separation of Core, Runtime, and Catalog

## Status
Accepted

## Context
In ContextOS v1, skill authoring, runtime thread management, context compilation, and adapter generation were tightly coupled across `.agents/` and CLI scripts. This led to cyclic dependencies, difficulty in establishing testing boundaries, and confusion over ownership.

## Decision
Split ContextOS into three clearly bounded architectural layers:
1. **Core**: Manifest schemas, compiled registry, canonical resolver, workspace evidence graph, and pure adapter compilers.
2. **Runtime**: Thread execution, Git worktree isolation, verification, reviewer gates, and sandbox environments (`contextos-mcp`).
3. **Catalog**: Authoritative skills, profiles, and templates (`.agents/core/skills`, `.agents/core/profiles`).

## Alternatives Considered
- *Monolithic single-package structure*: Simpler initially, but leaks MCP/Git runtime concerns into pure CLI context compilation.
- *Micro-repositories*: High maintenance overhead and fragmented versioning.

## Trade-offs
- Requires clear boundary contracts and shared JSON schemas.
- High architectural clarity, testability, and deterministic context generation.

## Impact
- Root CLI remains lightweight with zero install-time dependencies.
- Runtime server (`contextos-mcp`) consumes compiled core artifacts without code duplication.
