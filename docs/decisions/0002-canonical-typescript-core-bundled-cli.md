# ADR-002: Canonical Core and Bundled CLI

## Status
Accepted

## Context
ContextOS is consumed both as a global developer CLI (`npx contextos-agents` or `contextos`) and as a language server / MCP server in AI IDEs (Antigravity, Cursor, Claude Code). Writing logic in disparate untyped scripts causes feature divergence between CLI and MCP.

## Decision
Maintain the canonical algorithmic logic (manifest compilation, evidence scoring, resolver, graph building) in unified core modules and bundle them into self-contained CommonJS/ESM distribution formats where needed, while keeping the CLI interface fast and deterministic.

## Alternatives Considered
- *Separate implementations for CLI and MCP*: Causes subtle differences in resolution results and double maintenance burden.
- *Strict TypeScript requiring compilation step for every CLI invocation*: Unacceptable startup latency for developer CLI commands.

## Trade-offs
- Core algorithms must be strictly pure and isolated from platform-specific side effects.
- 100% parity between CLI and MCP tool outputs.

## Impact
- `CanonicalResolver` is the single source of truth for both CLI `contextos resolve` and MCP tool `contextos_resolve`.
