# Release preparation: core 2.3.0 / MCP 0.4.0

Updated 3 October 2026. These are unpublished candidates. Release preparation
does not authorize npm publication, a release tag or a GitHub release.

## Package and source identity

Both package versions and lockfiles must match. Candidate archives, installation
results and migration results must describe the same revision and SHA-256 hashes.
Raw logs remain local or in GitHub CI artifacts; reviewed manifests remain in
`docs/evidence/`. The final manifest is [release-2.3.json](evidence/release-2.3.json).

The cleaned candidate source is `81f39aea6108cda99eae9c07216882685b7a1d1a`.
Run [37122760907](https://github.com/kok-o/contextos-agents/actions/runs/37122760907)
passed all 19 jobs on Windows, Linux and macOS. Both archive SHA-256 hashes
match across all three runners and the isolated local build. Core tests passed
530/530; MCP passed 623 with seven experimental skips. Installed lifecycle,
upgrade from core 2.2.0 / MCP 0.3.1 and checkpoint rollback passed on every
platform, restoring 325 configuration files and preserving user rules.

The source revision above identifies the candidate archives. Later commits
recording reviewed evidence are documentation-only and do not redefine that
source revision. Internal plans, raw logs and machine-specific probes remain
local; removing previously tracked material does not rewrite public Git history.

The previous accepted cross-platform run is
[36970178246](https://github.com/kok-o/contextos-agents/actions/runs/36970178246)
on `4d633da`: 19/19 jobs passed. It is historical evidence and does not certify
subsequent cleanup changes. See [the CI report](CI_R2_2026-10-02.md).

## Verified candidate checks

- Core tests, catalog validation, compile/export drift and secret checks.
- MCP lint/build/tests; seven documented experimental skips remain outside the
  stable support claim. See [the skip inventory](MCP_SKIPPED_TESTS.md).
- Git and npm release surfaces contain no local credentials, audit diaries,
  raw API responses, logs or temporary experiments.
- Fresh installation of both candidate archives, real CLI wrappers, project
  overrides and default read-only MCP status.
- Upgrade from published core 2.2.0 / MCP 0.3.1 and checkpoint rollback preserving
  user rules. See [migration instructions](COMPACT_CONTEXT_MIGRATION.md).
- Cross-platform CI on the exact candidate source revision, retaining logs,
  archive contents and installed/migration results as CI artifacts.

## Remaining product gates

Explicit Codex CLI 0.159.2 body loading and marker adherence passed. Automatic
routing, Cursor activation and the external client pilot remain unverified.
The [compatibility matrix](ADAPTER_COMPATIBILITY.md),
[calibration summary](BENCHMARK_RESULTS.md) and [pilot protocol](PILOT_PROTOCOL.md)
state the limits of current evidence. General quality and production long-session
claims remain unsupported. Publication requires a separate decision.
