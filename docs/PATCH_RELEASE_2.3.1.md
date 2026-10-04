# Maintenance candidate: core 2.3.1 / MCP 0.4.1

Status: preparation in progress; neither package nor tag has been published.
The previous published pair remains core 2.3.0 / MCP 0.4.0. The
[historical manifest](evidence/release-2.3.json) is unchanged. Candidate identities
and acceptance belong in [release-2.3.1.json](evidence/release-2.3.1.json).

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

## Release decision

Tag creation, GitHub Release publication and npm uploads are separate from this
preparation. Publishing a GitHub Release starts the paired publish workflow.
Use the reviewed immutable commit and archives; if one upload fails, retry the
same identities as described in the [recovery procedure](R2_RELEASE_PREPARATION.md).
Registry acceptance can only be recorded after actual publication.
