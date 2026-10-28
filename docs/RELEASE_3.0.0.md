# ContextOS Core 3.0.0 release

Status: **published on 28 October 2026**. npm `contextos-agents@3.0.0` is
available on `latest`, with the
[GitHub Release `v3.0.0`](https://github.com/kok-o/contextos-agents/releases/tag/v3.0.0).
The source tag remains at commit `0ad9eeb7bf3bbe5d6c863fdf991c1f164edfc56f`.

For installation from npm, follow the
[README quickstart](../README.md#quickstart) or
[русскую инструкцию](INSTALLATION_RU.md). The recipe includes every catalog skill
and exports for Antigravity, Codex and Claude Code. The archive instructions
below are an alternative with an explicitly reviewed SHA-256.

The optional MCP package has an independent version and release path. It is not
built, installed or tested by core-only acceptance.

## What changes in 3.0

- `init` prepares `.agents/project/skills/` and a cache ignore block. The seven
  bundled engineering skills require `--with-core` (also enabled by `--minimal`
  and `--all`). The compiler runs from the installed package.
- Claude exports use `.claude/rules/` and `.claude/skills/`. An older managed
  `CLAUDE.md` block is removed while surrounding text is preserved.
- Generated output and lockfiles avoid whole-source-graph churn. Existing 2.x
  projects run `update` and review the resulting files.
- Export and uninstall preserve modified or unowned content, including merge
  conflict variants. `uninstall` shows its plan and requires `--yes`.
- Skill installation checks exact source pins, package identity and integrity.
  npm lifecycle scripts remain disabled. Entry checksums cover installed bytes.
- Resolver conflicts retain required safety guidance and explicit diagnostics.
  Project-only discovery and the public `index` command use the project's rules.
- Interrupted lock reclamation fails closed. After stopping all writers and
  watchers, `recover --unlock --force` clears an abandoned claim and preserves
  transaction journals and backups.

See the [changelog](../CHANGELOG.md#300---2026-10-28) for the released changes and
the [migration guide](MIGRATION.md#upgrading-from-2x-projects) for upgrade and
checkpoint rollback.

## Publication evidence

The [release acceptance run](https://github.com/kok-o/contextos-agents/actions/runs/40746599298)
verified one archive on Windows, Linux and macOS with Node.js 22 and 24. Upgrade
from 2.3.2 and checkpoint rollback passed in every matrix cell. Its npm access
preflight stopped before upload and was corrected in the publication tooling.

The [publication recovery](https://github.com/kok-o/contextos-agents/actions/runs/40751830912)
validated that original acceptance, source revision and artifact ZIP checksum,
then published the same archive and passed registry download and consumer
acceptance on all three operating systems. The source tag and archive were not
rebuilt or replaced.

Archive: `contextos-agents-3.0.0.tgz`. SHA-256:

```text
72840e7e40e0e13373a91470c9b6943d6866566bb9152236d107e5aad559dbfd
```

The GitHub Release asset and npm archive have this same hash, recorded in
`docs/release-identities/core-stable-3.0.0.json`. The earlier
[core preflight](https://github.com/kok-o/contextos-agents/actions/runs/40736760453)
and [main CI](https://github.com/kok-o/contextos-agents/actions/runs/40738846072)
also passed on the tagged source.

## Try the prepared archive

Use the exact archive selected by the reviewed identity under
`docs/release-identities/core-stable-3.0.0.json`. Its lowercase SHA-256 identifies
the bytes accepted by release validation. A hash from the historical RC or an
earlier preflight archive does not identify this stable archive.

In a separate project, replace the path below with the accepted archive path:

```sh
npm install --save-dev --save-exact /path/to/contextos-agents-3.0.0.tgz
npx --no-install contextos --version
npx --no-install contextos init
```

Continue with the [quickstart](../README.md#quickstart) to add a rule and exercise
`pass → drift → pass`. A project with no rules exports no rule bodies; add a
team rule or use `init --with-core` before expecting skill files.

The exact npm installation is:

```sh
npm install --save-dev --save-exact contextos-agents@3.0.0
```

The stable registry path uses `latest`; RC versions retain their separate
`next` path. MCP was not published as part of this release.

## Acceptance before publication

These are the checks used to accept the release. To reproduce its bytes, use
a clean checkout of `v3.0.0`, with Node.js 22+. Documentation on `main` may
advance after publication; the source tag and published archive remain fixed.

```sh
npm ci --ignore-scripts
npm run build
npm run validate
npm run validate:catalog
npm run test:core
node --test tests/release-publish.test.js
npm run test:skills
npm run lint:md
npm run check:secrets:core
npm run check:release-surface:core
node .agents/ctx.js export all --check --json
```

Create and inspect the exact stable archive after the source and generated
outputs are final:

```sh
node -e "require('node:fs').mkdirSync('scratch/release-candidate', { recursive: true })"
npm pack --ignore-scripts --pack-destination scratch/release-candidate
npm run check:consumer:core -- scratch/release-candidate
```

For upgrade and byte-for-byte checkpoint rollback from 2.3.2:

```sh
node -e "require('node:fs').mkdirSync('scratch/previous-core', { recursive: true })"
npm pack contextos-agents@2.3.2 --ignore-scripts --pack-destination scratch/previous-core
npm run check:migration:core -- scratch/previous-core/contextos-agents-2.3.2.tgz scratch/release-candidate/contextos-agents-3.0.0.tgz
```

The migration checker also accepts 2.2.0 or 2.3.1 as the previous archive.
Core-only checks require no MCP archive or installation.

The [release process](RELEASE_PROCESS.md) requires a reviewed identity for the
stable archive, matching package and lockfile metadata, and acceptance of the
same archive on Linux, Windows and macOS with Node.js 22 and 24. The publisher
rechecks identity and registry bytes before and after any authorized upload.
Changing packaged files requires a new archive, hash and acceptance run.

## Evidence boundaries

The [RC.1 record](RELEASE_3.0.0-rc.1.md) and
[earlier preflight](CORE_3_0_0_PREFLIGHT.md) remain historical evidence for their
own sources and archives. Stable acceptance must identify the final 3.0.0
archive; those older hashes and test counts cannot substitute for it.

Compiler, filesystem and installed-package tests establish the tested core
contracts. They do not prove that every client loads every export, that a model
follows instructions, or that every possible vulnerability is absent. The
[compatibility matrix](ADAPTER_COMPATIBILITY.md) retains the scope and versions
of recorded client observations. Core is a configuration compiler, not a
sandbox for agent actions.
