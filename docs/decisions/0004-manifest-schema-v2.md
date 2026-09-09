# ADR-004: Manifest Schema v2 and Deterministic Compiled Registry

## Status
Accepted

## Context
In ContextOS v1, skills were described through ad-hoc YAML files with unstructured metadata, ambiguous dependency definitions, and inconsistent keyword lists. Resolvers had to perform slow and nondeterministic regex searches over markdown files.

## Decision
Introduce `SkillManifestV2` schema (`.agents/schemas/skill.manifest.v2.json`) and a deterministic compile step:
1. Manifests explicitly define `signals` (`aliases`, `keywords` with weights and locales, `fileGlobs`, `packages`).
2. Manifests explicitly define `dependencies` (`requires`, `optional`, `conflicts`).
3. Manifests declare token budgets and resource inventories.
4. `ManifestCompiler` processes all authoring manifests into an immutable, cryptographically hashed `registry.v2.json` with SHA-256 integrity verification.

## Alternatives Considered
- *Runtime parsing of SKILL.md frontmatter on every prompt*: High latency and potential for subtle runtime parsing discrepancies.
- *Strict JSON-only authoring*: Degrades authoring DX for developers compared to YAML.

## Trade-offs
- Requires a build/compilation step (`node .agents/ctx.js compile`) whenever skill manifests change.
- Sub-millisecond runtime resolution, cryptographic reproducibility, and structured SARIF 2.1.0 diagnostics.

## Impact
- All runtime consumers read strictly from `registry.v2.json`.
- CI enforces registry freshness via `validate-skills.yml`.
