# ContextOS roadmap

Updated 2 October 2026. Source candidates: `contextos-agents@2.3.0` and
`@contextos/mcp@0.4.0`; these are not published releases.
[The work plan](../CONTEXTOS_WORK_PLAN.md) defines acceptance criteria;
[R2 preparation](R2_RELEASE_PREPARATION.md) records remaining release gates.

## Implemented scope

- Deterministic compilation and six adapter exports with user content preservation
  and drift checks. The [compatibility matrix](ADAPTER_COMPATIBILITY.md) separates
  export, discovery, activation and model behavior.
- Short bootstrap, task/file selection, project overrides, whole selected bodies,
  explained omissions and soft-budget overflow warnings.
- Offline optional catalog, presets, staged scanning and consumer CI governance.
  Export filters installed skills by profile; it does not resolve a task.
- Default read-only MCP status, compare and diff. Execution, delegation, merging,
  cleanup and Python REPL remain experimental.
- Local archive installation/lifecycle checks. Remote platform CI is a release gate;
  local Windows results do not certify Linux or macOS.

## Next: complete R2 preparation

1. Synchronize documentation and inventory MCP skips; cover stable API scenarios
   and state experimental limitations explicitly.
2. Verify upgrade from published core 2.2.0 and checkpoint rollback preserving
   project rules, root instructions and overrides.
3. Run Windows, Linux and macOS CI against one commit. Retain logs, installed
   archive results, hashes and archives as artifacts.
4. Complete the client pilot, then assemble one revision-bound candidate with
   changelog, migration, compatibility matrix and evidence.
5. Make a separate publication decision after CI and pilot results.

## Measurements on pause

Quality, cost and long-session measurements are incomplete. Small experiments do
not establish general savings or improved answers. The user paused benchmarks on
1 October; resume only on explicit request.

## Deferred until demonstrated need

AST/dependency graph extensions, swarm redesign, automatic learning, catalog
expansion, private registries, organization policy synchronization, IDE extensions
and a hosted service are research directions without promised versions or dates.
They are outside R1/R2.
