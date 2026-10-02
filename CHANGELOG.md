# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- R2 preparation: current scope/roadmap, explicit skipped-test inventory and
  checkpoint migration/rollback acceptance from core 2.2.0 / MCP 0.3.1.
- CI artifacts retain core/MCP test logs, MCP assertion JSON, both candidate
  archives and installed lifecycle/migration results. Manual CI dispatch enabled.
- Compact bootstrap and proportional workflows; required security guidance
  survives profile exclusions and soft-budget overflow.
- Default read-only MCP inspection and whole-body context assembly with source
  hashes, omissions and overflow reports. Execution remains experimental.
- Installed-tarball acceptance gate for both packages on Windows, Linux and macOS,
  including real CLI wrappers, project rules, update/uninstall preservation and
  a read-only MCP status request. Stable publication depends on this gate.
- A small TypeScript/team-rule demo and a corrected five-minute onboarding guide.

### Fixed

- MCP source reports and reference directories stay repository-relative when a
  workspace is opened through a directory alias, including macOS temporary paths.
- Offline permission fixtures canonicalize their roots and test a real portable
  out-of-allowlist file; CI matrices retain all platform outcomes without fail-fast.
- Restored stable MCP registration/status/compare/diff handler coverage, with
  runtime opt-in and no-session-creation checks. Python availability now probes
  the same executable as the runtime on Windows.
- Manifestless project skills now hash and load their actual entrypoint. All six
  adapters honor custom entrypoints and prefer `skill.v2.yaml` consistently.
- MCP tarball tests build in a private source copy so parallel protocol tests
  retain a complete runtime in the checkout.
- Installed-consumer acceptance covers manifestless rules and custom entrypoints
  in both native exports and MCP prompt assembly.
- Resolver parity tests always compile current MCP source in memory instead of
  accepting an ignored, possibly stale local build.
- Offline test fixtures no longer depend on a pre-existing scratch directory.
- MCP builds clear their package-local `dist` before compilation, preventing
  removed modules from remaining in later tarballs.

## [2.2.0] - 2026-09-27

### Added
- **Terminal Visual Layer (`bin/lib/ui.js`)**:
  - Zero-dependency CLI visualization module featuring a brand banner and formatted status badges.
  - Aligned 4-step execution tracker (`[1/4]` to `[4/4]`) with clean indentation grid (step titles, `✓` checkmarks, sub-explanations).
  - Dynamic interactive/batch progress bar (`renderProgressBar`) with TTY width detection and ANSI escape stripping for crisp boxed borders.
  - Styled success summary card (`renderSuccessCard`) highlighting immediate next steps, profile switching, and export commands.
- **Autonomous Offline Catalog Distribution**:
  - `init` atomically distributes the 36-skill catalog into `.agents/catalog/skills` directly within consumer projects (326 KB).
  - Consumer repositories can inspect (`contextos skill list --available`) and install (`contextos skill add <name>`) catalog skills completely offline without network access or global cache dependencies.
- **Stack Presets & Bulk Installation**:
  - Added `--preset <name>` support to `init` (`frontend`, `backend`, `devops`, `full`).
  - Added `--all` flag to `init` (`contextos init --all`) and `skill add` (`contextos skill add --all`) to deploy all 36 catalog skills in a single operation.
- **Intelligent Typo Suggestions**:
  - Integrated Levenshtein distance matcher for catalog skill commands: suggests closest valid skill names on typos (e.g. `skill add reat` -> `react`).

## [2.1.1] - 2026-09-27

### Fixed
- **NPM Package Catalog Distribution**: Included `catalog` in npm package distribution (`package.json` `files` field), ensuring catalog skills install cleanly in consumer projects without requiring local repository checkouts.
- **Fail-Closed Inspection Exit Codes**: Standardized exit codes across `scan` and `gate`: all reading, git, or configuration failures return code `2` with explicit diagnostics in both enforce and advisory modes; code `0` is returned strictly when verification completes cleanly with no blocking violations; code `1` is returned on blocking violations.
- **Literal Git Pathspecs & Diff Isolation**: Added `--literal-pathspecs`, `--no-ext-diff`, and `--no-textconv` to staged git diff and blob inspections, eliminating filename regex fragility and supporting paths with spaces, Unicode, and glob characters.
- **Pre-Commit Hook Safety & Trusted Local Runner**:
  - Automatically migrates existing trailing hook blocks from v2.1.0 to execute immediately after the shebang before any user `exit 0`.
  - Added strict shell shebang validation, rejecting non-shell interpreters (`python`, `node`) with exit code 1.
  - Resolved local executable via `./node_modules/.bin/contextos` or source repository runner, eliminating unpinned PATH binary fallback.
  - Preserves exact scanner exit codes (including code `2` for infrastructure/unverified errors) rather than coercing to code 1.
- **Cross-Repository Scan Targeting (`--project`)**: Added `--project <path>` support to `contextos scan`, enabling inspection of external target Git repositories from a central runner.
- **Supply-Chain Catalog Precedence**: Built-in package catalog skills take strict precedence over consumer project files, preventing local workspace files from hijacking catalog installations; local skills require explicit `local:` or path references.
- **Self-Contained MCP Selector Resolution**: Resolver parity tests now dynamically compile the TypeScript selector in-memory when gitignored `dist` is absent, guaranteeing clean checkout compatibility without pre-build requirements.
- **CLAUDE.md Preservation & Idempotency**: Claude Code adapter now generates `CLAUDE.md` with explicit `<!-- CONTEXTOS:START -->` and `<!-- CONTEXTOS:END -->` demarcation, preserving user preamble, custom guidelines, and ensuring idempotent re-exports.
- **Dual-Root Profile Discovery**: Extended dual-root contract to `profiles.js` (`listProfiles` and `getProfile`), enabling consumer projects to define custom profiles that are seamlessly discovered across all CLI and compiler entrypoints.
- **Skill Examples Verification Engine**: Replaced `vm.Script` with `esbuild.transformSync` (for TypeScript/TSX/ESM JavaScript) and Python AST parsing in `scripts/verify-skill-examples.js`, with syntax validation explicitly separated from behavioral runtime checks.
- **CLI Robustness & Documentation Alignment**: Restored `audit` proxy command (as an alias for `validate`), added rejection with exit code 1 for unknown commands, supported comma-separated `--target cursor,claude`, updated action examples to `v2.1.1`, and protected `.aider.conf.yml` against malformed YAML overwrites.

## [2.1.0] - 2026-09-26

### Added
- **4 New Industry Catalog Skills**:
  - `security-audit`: In-depth vulnerability scanning, SAST/DAST automation, dependency checking, privilege escalation prevention, and SAIF/CIS benchmark mapping.
  - `api-design`: Deterministic API design guidelines, RESTful contracts, idempotent operations, cursor pagination, rate limiting, and OpenAPI specifications.
  - `terraform`: Infrastructure as Code (IaC) governance, remote state locking, plan review quality gates, least-privilege provider blocks, and OpenTofu compatibility.
  - `ci-cd`: GitHub Actions hardening, matrix test workflows, supply chain artifact signing, branch protection rules, and build caching strategies.
- **Catalog Troubleshooting Guides (`TROUBLESHOOTING.md`)**: Complete diagnostic guides with root causes, concrete code fixes, and verification steps across all 36 catalog skills.
- **Design Style Code Implementations (`EXAMPLES.md`)**: Added production-ready TypeScript/Tailwind component examples to `minimalist-design`, `brutalist-design`, and `soft-design`.
- **End-to-End Testing Scenarios**: Enriched `testing` skill with comprehensive Playwright E2E testing scenarios, fixtures, mock routes, and cross-browser CI configurations.
- **Quality Gate Engine (`bin/lib/gate.js`)**: Deterministic, in-process drift verification engine checking managed outputs against source skills without disk mutation. Supports `--json` output, GitHub Actions annotations, and job step summaries.
- **Staged Git Index Security Scanner (`bin/commands/scan.js`)**: Fast, in-memory scanner inspecting `git diff --cached` for leaked API secrets, credential patterns, unfinished lazy stubs (`// TODO`), and task write-scope containment.
- **Isolated Pre-Commit Git Hooks (`bin/commands/hook.js`)**: Safe hook manager installing isolated ContextOS pre-commit verification blocks without overwriting or interfering with existing user hooks.
- **Isolated Composite Action (`.github/actions/contextos-gate`)**: Security-hardened CI action running from a pinned package version without executing consumer build scripts or `npm test`.
- **Adapter Compatibility Contracts (`docs/ADAPTER_COMPATIBILITY.md`)**: Comprehensive specifications and verified test contracts for Cursor, Claude Code, GitHub Copilot, Gemini CLI, Aider, and Zed.
- **Non-Destructive Aider Configuration Merger**: Preserves custom user settings (`model`, `auto-commits`, flags) in `.aider.conf.yml` using vendored AST parser while managing read-only rule conventions.
- **Public Init from Tarball Suite (`tests/consumer-init.test.js`)**: End-to-end tests for `init --auto`, `init --minimal`, `init --agent`, `init --dry-run`, safe non-destructive updates, and refusal to overwrite user files.
- **Transaction Recovery and Doctor Diagnostics**: Robust detection and remediation of interrupted transactions via `contextos recover --list`, `contextos recover --rollback <txId>`, and `contextos doctor`.
- **Developer Onboarding and Pilot Protocol (`docs/product/`)**: 5-minute quickstart guide, multi-repository pilot protocol, and topology validation results across Node/TS, pure Python/Go, and legacy config repositories.

### Changed
- **Catalog Skill Count**: Expanded verified catalog from 32 to 36 specialized skills (43 skills total including 7 core skills).
- **Catalog Sanitation**: Removed 13 redundant legacy markdown files across catalog skills to enforce single-source-of-truth standards.
- **CLI Help Index**: Updated `contextos --help` command registry to include `scan`, `hook`, `recover`, and `explain`.
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
