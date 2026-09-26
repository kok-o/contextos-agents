# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0-rc.1] - 2026-09-26

### Added
- **Quality Gate Engine (`bin/lib/gate.js`)**: Deterministic, in-process drift verification engine checking managed outputs against source skills without disk mutation. Supports `--json` output, GitHub Actions annotations, and job step summaries.
- **Isolated Composite Action (`.github/actions/contextos-gate`)**: Security-hardened CI action running from a pinned package version without executing consumer build scripts or `npm test`.
- **Adapter Compatibility Contracts (`docs/ADAPTER_COMPATIBILITY.md`)**: Comprehensive specifications and verified test contracts for Cursor, Claude Code, GitHub Copilot, Gemini CLI, Aider, and Zed.
- **Non-Destructive Aider Configuration Merger**: Preserves custom user settings (`model`, `auto-commits`, flags) in `.aider.conf.yml` using vendored AST parser while managing read-only rule conventions.
- **Public Init from Tarball Suite (`tests/consumer-init.test.js`)**: End-to-end tests for `init --auto`, `init --minimal`, `init --agent`, `init --dry-run`, safe non-destructive updates, and refusal to overwrite user files.
- **Transaction Recovery and Doctor Diagnostics**: Robust detection and remediation of interrupted transactions via `contextos recover --list`, `contextos recover --rollback <txId>`, and `contextos doctor`.
- **Developer Onboarding and Pilot Protocol (`docs/product/`)**: 5-minute quickstart guide, multi-repository pilot protocol, and topology validation results across Node/TS, pure Python/Go, and legacy config repositories.

### Changed
- **Pure Compiler Normalization**: Added CRLF line-ending normalization in semantic hashing to guarantee identical hash calculation across Windows, macOS, and Linux checkouts.
- **Package Size Verification**: Enforced 2.00 MB package limit in CI/prepublish (`scripts/verify-package-size.js`), maintaining a lightweight 0.95 MB unpacked footprint.

## [2.0.0] - 2026-09-13

### Changed (Breaking)
- Minimum supported Node.js version is now 22. Node.js 18 and 20 have reached end of life.
- **Product Repositioning:** ContextOS is now explicitly positioned as an Agent Context Governance tool (a deterministic context compiler), shifting away from "Autonomous AI Swarm" messaging.
- **Distribution Boundary:** The ContextOS MCP server and execution runtime are no longer bundled within the core `contextos-agents` package. They will be distributed separately via the `@contextos/mcp` package.
- **CLI Deprecation:** The `--with-mcp` and `setup-mcp` flags in the `contextos init` command are deprecated and now serve only as a warning/redirect to the new package.
- **Catalog Boundary:** The default installation profile has been reduced to a "Neutral Bootstrap" (core workflow, context management, security). Framework-specific and highly opinionated design skills are no longer installed by default.

### Added
- **Migration Commands:** Added `contextos profile prune` to safely remove optional skills that are no longer part of the default profile.
- **Boundary Documentation:** Added `docs/PRODUCT_BOUNDARIES.md` and `docs/MIGRATION.md`.

### Removed
- Unverified benchmark marketing claims regarding token reduction percentages have been removed until the reproducible Benchmark v2 suite is finalized.
