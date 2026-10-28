# Independent core release preparation

Core stable and core RC have dedicated release paths. These instructions describe
prepared automation, not a publication. MCP has its own package version; migrating
it to an independent maintenance workflow and standalone shared-source manifest
is separate work and is not included in this core preparation. MCP maintenance
remains limited to security and compatibility and must not require a core release.

| Path | GitHub release tag | npm dist-tag | Workflow |
| --- | --- | --- | --- |
| Core stable | `vX.Y.Z` | `latest` | `publish.yml` |
| Core RC | `vX.Y.Z-rc.N` | `next` | `publish-core-rc.yml` |
| MCP maintenance (planned separately) | Reserved `mcp-vX.Y.Z` | `latest` | Separate maintenance workflow not included here |

Only the core package and its lockfile are checked by these core release paths.
Core does not build, install or test MCP. Its supply-chain bundle is generated
from core-owned sources, and its build checks that bundle independently of MCP.
Optional companion synchronization helpers are for a separately authorized MCP
maintenance change; its source-copy manifest, standalone build and scanner wiring
must be reviewed in that change. They are not core acceptance requirements.
Historical paired release evidence and tags remain historical records.

## Core acceptance without publication

After pushing a branch with the final core sources and reviewed stable identity,
run the dedicated preflight on that branch:

```sh
gh workflow run validate-skills.yml --ref <branch> -f core_stable_preflight=true
```

This dispatch packs and verifies one archive, then tests those same bytes on
Linux, Windows and macOS with Node.js 22 and 24. It runs core tests, consumer
installation, migration from 2.3.2 and checkpoint rollback. MCP jobs are skipped;
no tag, GitHub Release or npm publication is created.

The run retains a candidate artifact named `core-stable-candidate-<commit>` and
six platform evidence artifacts containing test logs and acceptance results.
This preflight's candidate name is tied to the commit, so failed platform jobs
may be retried against that same archive. A source fix requires a new commit and
a new preflight run. Publication workflows use their own artifact retry rules
described below.

## Reviewed identity and exact archive

Prepare the candidate package locally and run its full acceptance suite before
creating a release. Calculate SHA-256 over the exact archive. A reviewer must add
`docs/release-identities/<path>-<version>.json` with the selected path, package,
version, archive filename and lowercase SHA-256. For example, synthetic values:

```json
{
  "kind": "core-stable",
  "name": "contextos-agents",
  "version": "7.1.0",
  "file": "contextos-agents-7.1.0.tgz",
  "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
}
```

The core kinds are `core-stable` and `core-rc`; tooling reserves `mcp` for the
separate maintenance path. A reviewed
identity for one version is not valid for a different package or version. Any
change to packaged files requires a new archive, hash and acceptance run. Keep
the archive and test evidence together; the older 3.0.0 preflight archive is
historical after packaged files change.

Each core release workflow validates its tag and package/lockfile identity and packs once on
Linux without scripts. It checks the archive surface and reviewed hash, then
passes that same artifact to each platform's production-only consumer test.
Platforms also build and test their own checkout, but do not substitute a
different local tarball for the accepted bytes. The publish job downloads the
same accepted archive and
rechecks the bytes and embedded package identity immediately before `npm publish
--ignore-scripts`, with an explicit dist-tag. Registry metadata and bytes are
checked before and after an upload. A retry accepts an already published version
only when the registry archive has the reviewed hash; different bytes fail closed.
Registry acceptance also checks the expected dist-tag. A missing identity or an
unavailable mandatory check is a failure, not a skipped release gate.
For a workflow retry, rerun all jobs so the current attempt creates and tests
its own artifact; rerunning only a failed downstream job can fail closed when
that attempt's artifact is absent. Registry verification makes an ambiguous
previous upload safe to retry without accepting different archive bytes.

The core stable and RC workflows are selected by disjoint release tag and
prerelease conditions; the reserved MCP tag prefix does not select either path.
The historical paired publisher is retained only for old evidence and is not
invoked by these core workflows. Never use these workflows as a
substitute for resolving open security findings or the decision to publish.
