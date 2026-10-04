# Release status: core 2.3.0 / MCP 0.4.0

Updated 4 October 2026. Both packages are published and recorded as verified in
the release manifest. This document also describes the preparation and recovery
procedure for subsequent releases; new changes require their own acceptance.

The published core 2.3.1 / MCP 0.4.1 maintenance update is tracked separately in
the [patch checklist](PATCH_RELEASE_2.3.1.md). This document and the published
2.3.0 manifest remain historical evidence for that release.

## Package and source identity

Both package versions and lockfiles must match. Candidate archives, installation
results and migration results must describe the same revision and SHA-256 hashes.
Raw logs remain local or in GitHub CI artifacts; reviewed manifests remain in
`docs/evidence/`. The final manifest is [release-2.3.json](evidence/release-2.3.json).

The released source, referenced by tag `v2.3.0`, is
`97ea455f3f942416e324c7308acecaa91846d5c5`.
Run [37129710149](https://github.com/kok-o/contextos-agents/actions/runs/37129710149)
passed all 21 jobs, including registry acceptance on Windows, Linux and macOS. Both archive SHA-256 hashes
match across all three runners and the isolated local build. Core tests passed
530/530; MCP passed 623 with seven experimental skips. Installed lifecycle,
upgrade from core 2.2.0 / MCP 0.3.1 and checkpoint rollback passed on every
platform, restoring 325 configuration files and preserving user rules.

The source revision above identifies the released archives. Later commits
recording reviewed evidence are documentation-only and do not redefine that
source revision. Internal plans, raw logs and machine-specific probes remain
local; removing previously tracked material does not rewrite public Git history.

The previous accepted cross-platform run is
[36970178246](https://github.com/kok-o/contextos-agents/actions/runs/36970178246)
on `4d633da`: 19/19 jobs passed. It is historical evidence and does not certify
subsequent cleanup changes. See [the CI report](CI_R2_2026-10-02.md).

## Verified release checks

- Core tests, catalog validation, compile/export drift and secret checks.
- MCP lint/build/tests; seven documented experimental skips remain outside the
  stable support claim. See [the skip inventory](MCP_SKIPPED_TESTS.md).
- Git and npm release surfaces contain no local credentials, audit diaries,
  raw API responses, logs or temporary experiments.
- Fresh installation of both registry archives, real CLI wrappers, project
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
claims remain unsupported. These limits remain after publication.

## Publication and partial-release recovery

Publishing a GitHub Release triggers `publish.yml`; pushing a tag alone does not.
Pin the release tag to the reviewed commit explicitly. Before either npm upload,
the workflow builds both packages, packs real archives, checks their surfaces and
compares SHA-256 with the reviewed manifest. Installed-consumer CI performs the
same archive-identity check on Windows, Linux and macOS.
Starting with 2.3.1, the helper selects `docs/evidence/release-<core-version>.json`;
it never replaces or silently reuses a previous release's archive identities.

The publish helper checks both registry versions before the first upload. An
existing version is accepted only if its downloaded bytes match the expected
hash. A 401, 403 or server error fails the preflight; only 404 means absent.
If an upload is needed, npm authentication and account read-write access to both
packages are checked first using `NPM_TOKEN`. Token-specific restrictions and
automation/2FA policies can still reject an actual upload; the existence of a
GitHub secret alone does not prove usable publishing rights.

Two npm publications are sequential, not atomic. If the second upload fails,
the first package remains published. Retained publication evidence records
completed uploads. Rerun the failed publish job at the same immutable tag: the
helper verifies and skips the existing identical archive, then uploads the
missing package. A mismatching existing version blocks recovery; never overwrite
the evidence or unpublish a version to force a retry. Both archives are uploaded
with lifecycle scripts disabled, so publishing cannot silently rebuild them.

After both uploads, separate Windows/Linux/macOS jobs download both versions
from npm, verify hashes and exercise installed lifecycle, upgrade and checkpoint
rollback. Their logs, results and registry archives remain CI artifacts. Only
successful registry acceptance establishes a checked published release.
