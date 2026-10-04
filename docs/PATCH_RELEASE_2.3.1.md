# Maintenance release: core 2.3.1 / MCP 0.4.1

Status: published and verified maintenance release.
The previous published pair remains core 2.3.0 / MCP 0.4.0. The
[historical manifest](evidence/release-2.3.json) is unchanged. Released identities
and acceptance belong in [release-2.3.1.json](evidence/release-2.3.1.json).

[CI 37194510641](https://github.com/kok-o/contextos-agents/actions/runs/37194510641)
passed 19/19 jobs at `f0bcf7628b8c5874315785412da399c56bddcfa9` on Windows,
Linux and macOS (core Node 22/24). All three platforms' installed-consumer and
both migration/rollback reports passed; their actual archive hashes match the
manifest. Core tests: 532 passed. MCP tests: 623 passed, seven existing skips.
Later evidence-only commits do not change the reviewed package archives.

The first run passed 18/19 but Windows rollback `npm ci` exceeded its 180-second
bound. Windows dependency installation now has a bounded 600-second allowance;
CLI checks retain 180 seconds and command durations are recorded. The successful
rerun restored all 424 configuration files; that npm step took 104 seconds.
The original failure remains recorded in the manifest and retained CI artifacts.

## Changes and compatibility

This patch fixes installation/version instructions and Action defaults, moves
TypeScript to MCP development dependencies, and verifies production-only
installed consumers. The installed MCP checker handles filesystem aliases.
The release helper reads the current version's manifest, and registry acceptance
tests both legacy and directly preceding upgrade/rollback paths.

Supported behavior remains core compilation/selection/export and default read-only
MCP inspection. Runtime execution, Python and recovery/concurrent persistence
remain experimental with seven documented skips. The dependency move does not
turn internal labs into a supported library API. See the
[skip inventory](MCP_SKIPPED_TESTS.md) and [client check](LIVE_CLIENT_CHECK_RU.md).

The live-check fixture uses an explicit `skill.yaml` description. Current exporters
fall back to a generic routing description for manifestless skills; body export
coverage does not establish useful automatic routing for that variant.

The [live CLI check](evidence/release-2.3.1.json) passed three scenarios on
2026-10-04 with Codex CLI 0.149.1, API authentication and `gpt-6-astra` at low
reasoning effort. The negative control produced no marker; explicit invocation
injected the native skill body; automatic selection read the native exported
skill from its catalog entry and produced the expected marker. Each condition
used a fresh session and an independent installed-consumer project. Source and
export hashes remained unchanged, and a separate Node process checked results.
This is one run per condition, not a reliability benchmark. Unrelated-task and
updated-skill scenarios, desktop clients and the external pilot remain unverified.
The CLI used fallback model metadata; the original sandbox-blocked attempt and
the successful retry traces are retained in the local evidence directory listed
in the report. The retry kept the Windows sandbox enabled.

## Acceptance before publication

- Match both package.json versions and both lockfile root versions.
- Build core and MCP, then run core/MCP tests, publication recovery tests,
  lint, catalog validation, drift and release-surface checks.
- Pack immutable .tgz files; record byte size and SHA-256 in the candidate manifest.
- Run an installed consumer outside the checkout with development dependencies
  omitted and TypeScript unavailable; verify MCP handshake and read-only behavior.
- Check upgrade/checkpoint rollback from 2.3.0 / 0.4.0 and legacy 2.2.0 / 0.3.1.
- Run the Windows/Linux/macOS matrix at the candidate commit and compare the
  retained archive hashes against the manifest on every platform.
- Record unverified client scenarios separately; this patch does not expand
  compatibility claims based on generated files alone.

Run `node scripts/publish-release-pair.cjs prepare` only after the manifest has
real archive hashes. This command packs and verifies both archives without
publishing. A missing/mismatching manifest or archive fails closed.

## Upgrade after publication

Take a clean Git/checkpoint backup of user configuration, package.json and the
lockfile as described in the [rollback guide](COMPACT_CONTEXT_MIGRATION.md).
After the pair is published:

```sh
npm install --save-dev contextos-agents@2.3.1 contextos-mcp@0.4.1
npx --no-install contextos update
npx --no-install contextos export all
```

Install only core if MCP is not used. Keep the project's existing dependency
classification when it differs from this development-tool example. Rollback
restores the checkpoint package/lock/configuration together; it is not a forced
overwrite of modified user rules. The candidate is exercised from local archives
before publication, not by requesting nonexistent registry versions.

The Action example requires the new v2.3.1 tag and explicit `version: '2.3.1'`.
Existing v2.3.0 pins do not change automatically.

## Release publication and verification

The pair was published via GitHub Release `v2.3.1` and the release workflow
[37197508427](https://github.com/kok-o/contextos-agents/actions/runs/37197508427),
which passed all 21 jobs including npm registry installation, upgrade and checkpoint
rollback across Windows, Linux and macOS. Both packages are published to npm and
verified against reviewed archive identities.
