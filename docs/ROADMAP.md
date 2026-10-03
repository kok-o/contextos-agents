# ContextOS roadmap

Updated 3 October 2026. Core 2.3.0 and MCP 0.4.0 are prepared candidates;
publication remains a separate decision. See [release preparation](R2_RELEASE_PREPARATION.md).

## Implemented

- Deterministic compilation, six adapter exports, preservation of user content,
  project overrides and drift checks.
- Compact bootstrap, task/file selection, whole selected skill bodies and
  warnings for missing sources, omissions and soft-budget overflow.
- Required safety guidance survives profile exclusions and small soft budgets.
- Offline catalog, presets, staged scanning and installed-consumer CI.
- Default read-only MCP inspection; runtime execution remains experimental.
- Upgrade from core 2.2.0 / MCP 0.3.1 and checkpoint rollback preserving rules.
- Windows/Linux/macOS acceptance, including real npm archive installation.

## Remaining release gates

1. Verify the cleaned release revision and both archive identities in CI.
2. Complete the client pilot. Explicit Codex activation is verified; automatic
   routing, Cursor activation and external user workflows remain unverified.
3. Review the revision-bound changelog, compatibility matrix and evidence,
   then decide whether to publish.

## Quality and cost

[Calibration results](BENCHMARK_RESULTS.md) compare compact selection, full
instructions and vanilla prompts. They do not establish a general quality
advantage or production long-session performance. The next measurement phase
uses real repository tasks and longer sessions with independent acceptance.

## Deferred until demonstrated need

AST graph extensions, swarm redesign, automatic learning, catalog expansion,
private registries, organization policy synchronization, IDE extensions and a
hosted service are research directions without promised versions or dates.
