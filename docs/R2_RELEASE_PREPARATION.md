# R2 release preparation — 2 October 2026

Core 2.3.0 / MCP 0.4.0 remain unpublished local candidates. Preparation items
1, 2 and 4 are locally verified; remote CI is now PASS on `4d633da`.
The client pilot and final candidate decision remain pending.
Benchmarks are paused. No paid model requests or publication occurred.

| Work item | Status and evidence |
| --- | --- |
| Plans/documentation | Work plan, roadmap, implementation status, changelog, compatibility and migration synchronized. Historical baselines remain labeled as historical. |
| 25 baseline MCP skips | Inventory in [MCP_SKIPPED_TESTS.md](MCP_SKIPPED_TESTS.md). Five stable cases restored and three additional cases added. Correct Python probe executes 13 REPL cases locally. Seven experimental execution/persistence skips remain. |
| Remote platform CI | Run `36970178246` on `4d633da`: 19/19 jobs PASS, all three OSes, core Node 22/24, MCP and installed lifecycle/migration. Twelve artifacts saved; [CI report](CI_R2_2026-10-02.md). Initial failed run retained separately. |
| Migration/rollback | Published core 2.2.0 / MCP 0.3.1 → fresh candidate archives → checkpoint and old lockfile restore. Both versions restored, 325 configuration files restored byte-for-byte, export drift absent, user instructions and overrides preserved. |
| Final release candidate | CI-verified pair and hashes recorded for `4d633da`; final candidate decision awaits client pilot. No publication approval. |

## Local verification

- Core after CI corrections: 524 passed, zero failed/cancelled/skipped.
- MCP after CI corrections: 623 passed, zero failed, 7 skipped; 50 files passed.
- MCP lint: zero errors, 5 warnings, 2 infos.
- Fresh core/MCP builds, real npm archive installation, CLI wrappers, project
  rules, update/uninstall preservation and read-only MCP handshake/status: PASS.
- Migration of both packages and checkpoint rollback: PASS. This does not certify
  experimental runtime-state migration or provider execution.
- Catalog validation: zero errors/warnings. Export check: no drift.
- Secret scan before evidence collection: 799 files, no findings.
- Updated guide/roadmap/skip inventory Markdown lint and workflow YAML parsing:
  PASS. The remote matrix subsequently passed on all three OSes.

Initial sandbox runs encountered Python spawn and npm-cache restrictions; those
failed logs are retained separately. The full successful runs used access to
local Python/Git/cache. Core build also needed write access to protected `.agents`
generated files. None of those failed attempts is counted as successful coverage.

## Archive and revision identity

The accepted CI pair comes from revision
`4d633da0b6180c266a6acf5034c4f310eb2ed348`, run `36970178246`.
Use `scratch/r2-verified-4d633da` or the corresponding CI artifacts. This is a
CI-verified pair awaiting pilot evaluation, not a public release. The
[accepted CI evidence](evidence/ci-r2-accepted-2026-10-02.json) records the exact
archive hashes, all jobs, MCP skips and platform migration results.

### Earlier local preparation snapshot

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
   changes/logs and subsequent CI corrections on 2 October. Remote CI is complete:
   core Node 22/24, MCP and installed lifecycle/migration passed on all three OSes;
   run URL, commit SHA and artifact identities are in the accepted CI evidence.
2. Complete the client pilot. Codex metadata and explicit body injection into CLI
   payload are verified; model adherence, Cursor activation and the user pilot
   remain unverified. See [pilot protocol](PILOT_PROTOCOL.md).
3. Assemble the final changelog, compatibility matrix, archives and evidence for
   the exact accepted revision; decide publication separately.

The seven experimental skips do not promise execution/recovery support. Quality,
cost and long-session evaluation remain incomplete and paused until explicitly
requested. New AST graphs, swarm work and catalog expansion are out of scope.
