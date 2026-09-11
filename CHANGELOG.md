# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (Breaking)
- **Product Repositioning:** ContextOS is now explicitly positioned as an Agent Context Governance tool (a deterministic context compiler), shifting away from "Autonomous AI Swarm" messaging.
- **Distribution Boundary:** The ContextOS MCP server and execution runtime are no longer bundled within the core `contextos-agents` package. They will be distributed separately via the `@contextos/mcp` package.
- **CLI Deprecation:** The `--with-mcp` and `setup-mcp` flags in the `contextos init` command are deprecated and now serve only as a warning/redirect to the new package.
- **Catalog Boundary:** The default installation profile has been reduced to a "Neutral Bootstrap" (core workflow, context management, security). Framework-specific and highly opinionated design skills are no longer installed by default.

### Added
- **Migration Commands:** Added `contextos profile prune` to safely remove optional skills that are no longer part of the default profile.
- **Boundary Documentation:** Added `docs/PRODUCT_BOUNDARIES.md` and `docs/MIGRATION.md`.

### Removed
- Unverified benchmark marketing claims regarding token reduction percentages have been removed until the reproducible Benchmark v2 suite is finalized.
