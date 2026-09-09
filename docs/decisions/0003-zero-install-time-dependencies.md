# ADR-003: Zero Install-Time Runtime Dependencies

## Status
Accepted

## Context
When developers run `npx contextos-agents` or install ContextOS in enterprise environments, heavy dependency trees introduce security vulnerabilities, slow network downloads, dependency conflicts, and audit friction.

## Decision
Enforce a strict architectural constraint for the root `contextos-agents` package:
- `dependencies: {}` in root `package.json`.
- All CLI utilities, parsers, graph builders, and resolvers must rely strictly on Node.js built-in standard library modules (`fs`, `path`, `crypto`, `os`, `child_process`, `readline`, `events`).

## Alternatives Considered
- *Installing external libraries (`commander`, `yaml`, `chalk`, `glob`, `zod`)*: Increases install footprint by tens of megabytes and introduces supply-chain attack surface.
- *Bundled vendored binaries*: Cross-compilation complexity.

## Trade-offs
- Core parsers and graph algorithms must be authored and maintained using native standard library primitives.
- Instant installation (< 1 second), zero supply-chain vulnerabilities, zero dependency audit flags.

## Impact
- Enterprise adoption without security review blocks.
- Root test runner uses native `node:test` and `node:assert`.
