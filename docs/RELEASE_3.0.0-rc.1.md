# ContextOS Core 3.0.0-rc.1

> Historical RC.1 record: current release automation is documented in
> [RELEASE_PROCESS](RELEASE_PROCESS.md); later changes require new evidence.

Status: **core release candidate**, prepared 24 October 2026 for publication on
25 October 2026 through npm's `next` tag. The [GitHub prerelease](https://github.com/kok-o/contextos-agents/releases/tag/v3.0.0-rc.1)
and its linked publication workflow record whether registry acceptance completed.
The separate MCP package is excluded from the core-only release validation and
retains its existing version.

Once the publication workflow succeeds, install the exact candidate with:

```sh
npm install --save-dev --save-exact contextos-agents@3.0.0-rc.1
```

The `latest` tag remains on the stable 2.x release. Fresh client loading and
model adherence still require the checks in the compatibility matrix.

## Why a major version

- Default `init` installs rule sources and a cache ignore block. Bundled core
  skills require `--with-core` (also enabled by `--minimal` and `--all`).
- The compiler runs from the installed package; its code is no longer copied
  into the consumer's `.agents/` folder.
- Claude output moves from a `CLAUDE.md` link index to `.claude/rules/` and
  `.claude/skills/`. Export removes only the older managed block.
- `uninstall` requires `--yes`, preserves project rules and shared Aider settings.
- Generated output and lockfile formatting change. Existing 2.x projects must
  run `update` and review their generated files.

The [migration guide](MIGRATION.md#upgrading-from-2x-projects) explains upgrade
and checkpoint rollback. Archive and demo records for 2.x remain historical.

## Build and check the core

From the repository root, with Node.js 22+:

```sh
npm ci --ignore-scripts
npm run build
npm run validate
npm run validate:catalog
npm run test:core
node --test tests/release-publish.test.js
npm run test:skills
npm run lint:md
npm run check:secrets
npm run check:release-surface:core
npm pack --ignore-scripts --pack-destination scratch/release-candidate-3.0.0-rc.1
npm run check:consumer:core -- scratch/release-candidate-3.0.0-rc.1
```

Create the archive directory before packing if it does not exist. Alternatively,
`node scripts/release.js --core-only` performs the local smoke/build and packs
the core. Neither route publishes anything. Core-only test execution excludes
the selector parity, runtime state-machine, sandbox execution, transactional Git
and verification/reviewer suites, which load the separate MCP source package.

To verify an upgrade and byte-for-byte checkpoint rollback from 2.3.2:

```sh
npm pack contextos-agents@2.3.2 --ignore-scripts --pack-destination scratch/release-candidate-3.0.0-rc.1
npm run check:migration:core -- scratch/release-candidate-3.0.0-rc.1/contextos-agents-2.3.2.tgz scratch/release-candidate-3.0.0-rc.1/contextos-agents-3.0.0-rc.1.tgz
```

The same command accepts 2.2.0 or 2.3.1 as the previous archive. Core-only checks
do not require an MCP archive or install MCP in their temporary consumers.

## Try the exact archive

In a separate project, replace the path below with the absolute archive path:

```sh
npm install --save-dev --save-exact /path/to/contextos-agents-3.0.0-rc.1.tgz
npx --no-install contextos --version
npx --no-install contextos init
```

Follow the [quickstart](../README.md#quickstart) to add a rule and exercise
`pass → drift → pass`. A project with no rules exports no rule bodies; add a
team rule or use `init --with-core` before expecting skill files.

## Candidate boundaries

Local validation on **Windows / Node.js 24.19.0**, 24 October 2026:

| Check | Result |
| --- | --- |
| Core-only suite | 535/535 passed; the five MCP source suites are excluded |
| Stable publisher regression suite | 13/13 passed using mocked publication calls |
| Skill examples | 68/68 checks passed |
| Fresh production-only archive installation | Passed without MCP |
| Default CommonJS and ESM consumers | init, compile, export, status, validate, strict doctor, stats, resolve and gate passed |
| 2.2.0, 2.3.1 and 2.3.2 upgrades | Passed; checkpoint rollback restored every configuration byte |
| Validators, Markdown, secrets, release surfaces and drift | Passed |

The strict-doctor consumer probe also found and fixed an optional-claims bug:
absent benchmark claims are skipped; explicitly declared missing evidence still
fails. The installed-package regression covers both CJS and ESM consumers.

- Local file-contract and installed-package tests establish compiler behavior.
  They do not establish live rule loading or model adherence in every client.
- Cross-platform hosted CI passed for PR #29 at `fef136e`; the publication
  workflow additionally verifies the reviewed core archive on all three OSes.
  Fresh client sessions remain a separate gate before a stable 3.0.0 release.
- `publishConfig.tag` is `next`, so a future authorized prerelease publication
  does not use `latest` by default.
- The existing stable paired publisher rejects prerelease versions. This RC
  uses `publish-core-rc.yml` and the `*-core-rc` publisher modes to publish only
  the reviewed core archive. Its identity is in `docs/release-core-rc.json`;
  publication retries verify registry bytes before skipping an existing version.
- Hashes and run reports under `scratch/release-candidate-3.0.0-rc.1/` were captured
  from the local prepared tree before committing. They do not establish
  publication or hosted CI acceptance.
