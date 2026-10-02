# R2 release preparation — 2 October 2026

Core 2.3.0 / MCP 0.4.0 remain unpublished local candidates. Preparation items
1, 2 and 4 are locally verified; remote CI and the final candidate remain pending.
Benchmarks are paused. No paid model requests or publication occurred.

| Work item | Status and evidence |
| --- | --- |
| Plans/documentation | Work plan, roadmap, implementation status, changelog, compatibility and migration synchronized. Historical baselines remain labeled as historical. |
| 25 baseline MCP skips | Inventory in [MCP_SKIPPED_TESTS.md](MCP_SKIPPED_TESTS.md). Five stable cases restored and three additional cases added. Correct Python probe executes 13 REPL cases locally. Seven experimental execution/persistence skips remain. |
| Remote platform CI | First run `36969036566` on `d6a2bd4`: all three installed consumer/migration jobs PASS, but macOS suites and Linux OCI FAIL; matrix cancellation affected remaining jobs. See [CI report](CI_R2_2026-10-02.md). Corrected revision/re-run pending. |
| Migration/rollback | Published core 2.2.0 / MCP 0.3.1 → fresh candidate archives → checkpoint and old lockfile restore. Both versions restored, 325 configuration files restored byte-for-byte, export drift absent, user instructions and overrides preserved. |
| Final release candidate | Pending remote CI and client pilot. Local archives and evidence are preparation artifacts, not publication approval. |

## Local verification

- Core: 523 passed, zero failed/cancelled/skipped.
- MCP: 622 passed, zero failed, 7 skipped; 50 files passed.
- MCP lint: zero errors, 5 warnings, 2 infos.
- Fresh core/MCP builds, real npm archive installation, CLI wrappers, project
  rules, update/uninstall preservation and read-only MCP handshake/status: PASS.
- Migration of both packages and checkpoint rollback: PASS. This does not certify
  experimental runtime-state migration or provider execution.
- Catalog validation: zero errors/warnings. Export check: no drift.
- Secret scan before evidence collection: 799 files, no findings.
- Updated guide/roadmap/skip inventory Markdown lint and workflow YAML parsing:
  PASS. Remote runner behavior is still unverified.

Initial sandbox runs encountered Python spawn and npm-cache restrictions; those
failed logs are retained separately. The full successful runs used access to
local Python/Git/cache. Core build also needed write access to protected `.agents`
generated files. None of those failed attempts is counted as successful coverage.

## Archive and revision identity

The pair is in `scratch/r2-candidate-2026-10-02`. The acceptance scripts use that
directory explicitly, rather than the older `scratch/release-candidate` pair.
The [machine evidence](evidence/r2-preparation-2026-10-02.json) records archive/log
hashes, commands, results, skipped names, base commit and a source-content manifest.
Raw successful logs and result JSON are retained under
`docs/evidence/r2-preparation-2026-10-02/`.

Base commit is `4bed8dd566f4eb308c3395530ff42172d503c9bf` plus the preparation
diff. This working tree is not a final immutable release revision. Before final
acceptance, commit the preparation, run remote CI on that SHA, and regenerate the
candidate/evidence against the same SHA. Archive hashes may differ between OS
builds; each OS artifact must retain its own installed archive hashes.

## Remaining gates

1. GitHub authentication and ADMIN access to the public `kok-o/contextos-agents`
   repository are verified. The user explicitly approved exporting the prepared
   changes and logs on 2 October. Push the preparation revision and dispatch `validate-skills.yml`
   for that ref and record the run URL, commit SHA, jobs and artifact identities.
   Require core Node 22/24, MCP and installed lifecycle/migration on all three OSes.
2. Complete the client pilot. Codex metadata and explicit body injection into CLI
   payload are verified; model adherence, Cursor activation and the user pilot
   remain unverified. See [pilot protocol](PILOT_PROTOCOL.md).
3. Assemble the final changelog, compatibility matrix, archives and evidence for
   the exact accepted revision; decide publication separately.

The seven experimental skips do not promise execution/recovery support. Quality,
cost and long-session evaluation remain incomplete and paused until explicitly
requested. New AST graphs, swarm work and catalog expansion are out of scope.
