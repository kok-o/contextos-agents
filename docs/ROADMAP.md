# ContextOS roadmap

Updated 4 October 2026. The maintenance release record lists core 2.3.1 and
MCP 0.4.1 as published; see [the release record](PATCH_RELEASE_2.3.1.md).
Changes below the release boundary are local, unreleased improvements.
The [2.3.2 / 0.4.2 candidate](PATCH_RELEASE_2.3.2.md) prepares these improvements
as a separate patch release with its own archive and CI evidence.

## Implemented

- Deterministic compilation, six adapter exports, preservation of user content,
  project overrides and drift checks.
- Compact bootstrap, task/file selection, whole selected skill bodies and
  warnings for missing sources, omissions and soft-budget overflow.
- Required safety guidance survives profile exclusions and small soft budgets.
- Offline catalog, presets, staged scanning and installed-consumer CI.
- Default read-only MCP inspection; runtime execution remains experimental.
- Upgrade/checkpoint rollback preserving user rules.
- Release records include Windows/Linux/macOS installed archive acceptance.

## Local reliability improvements

- Destructive task selection handles intervening words in Russian and English,
  while ordinary import cleanup keeps its standard risk classification.
- Manifestless descriptions survive compilation and native, Cursor and Zed
  exports; v2 manifests and custom entrypoints retain precedence.
- Formerly skipped MCP handlers and persistence cases use the current contract.
  A killed child process exercises reconciliation of saved running work.
- A deterministic executor fixture exercises failed verification, repair,
  stale-evidence rejection and a verified Git merge. No paid model is invoked.
- Skill checks cover all seven core skills and four catalog skills, with syntax,
  structure, simulated behavior and original-source behavior counted separately.

See [the improvement record](RELIABILITY_IMPROVEMENTS.md). Runtime execution and
recovery remain experimental; a local fixture does not establish provider or
power-loss reliability.

## Next acceptance work

1. Keep published archive identities unchanged; bind a future candidate to its
   own source, CI results and archive hashes.
2. Define and verify the supported external skill bundle contract end to end:
   entrypoint, routing metadata, declared resources, install and export. The
   GitHub path currently fetches a fixed file set; manifestless resources are
   not included by the shared resource exporter. Exercise fresh consumers and
   reuse existing preview, provenance and transaction mechanisms.
3. Extend existing resolver and consumer suites with a labeled RU/EN corpus and
   generated invariant cases. Keep ContextOS resolution separate from client
   model routing; retain seeds and reproducible counterexamples.
4. Extend the client pilot. The 2.3.1 Codex CLI record covers negative, explicit
   and automatic scenarios once each with a manifest. Unrelated-task,
   updated-skill, manifestless, resource loading and other-client scenarios
   remain unverified. Compare the same rule with manual setup or an existing
   synchronization script, recording maintenance effort and detected drift.

See [the direction review](PROJECT_DIRECTION_2026-10-04.md) for the proposed
scope, acceptance criteria and task-specific use of external skills. These are
planned next steps; external skills have not been installed by this review.
The personal Astra/Gemini workflow remains a separate local plan, beginning
with one task handoff and verification using existing
contracts before expanding runtime automation.

## Quality and cost

[Calibration results](BENCHMARK_RESULTS.md) compare compact selection, full
instructions and vanilla prompts. They do not establish a general quality
advantage or production long-session performance. The next measurement phase
uses real repository tasks and longer sessions with independent acceptance.
Paid benchmarks remain paused until explicitly requested.

## Deferred until demonstrated need

AST graph extensions, swarm redesign, automatic learning, catalog expansion,
private registries, organization policy synchronization, IDE extensions and a
hosted service are research directions without promised versions or dates.
