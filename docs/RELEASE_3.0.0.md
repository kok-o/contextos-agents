# ContextOS Core 3.0.0 preparation

Status: **prepared stable core, not published**. This document prepares the
`contextos-agents@3.0.0` source and archive for review. A branch commit or a CI run
does not create a `v3.0.0` tag, a GitHub Release or an npm publication. Those
actions require a separate publication decision.

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

See the [changelog](../CHANGELOG.md#300---unreleased) for the prepared changes and
the [migration guide](MIGRATION.md#upgrading-from-2x-projects) for upgrade and
checkpoint rollback.

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

After a separately authorized publication has completed registry acceptance,
the exact registry installation is:

```sh
npm install --save-dev --save-exact contextos-agents@3.0.0
```

The stable registry path uses `latest`; RC versions retain their separate
`next` path. No publication or distribution-tag change is claimed here.

## Acceptance before publication

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
