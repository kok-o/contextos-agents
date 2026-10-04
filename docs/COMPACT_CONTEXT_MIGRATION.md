# Compact context migration: 2.3.0 / MCP 0.4.0

These versions are published. The [release manifest](evidence/release-2.3.json)
records the verified registry archives and source revision.

## Behavioral changes

The project bootstrap is shorter. Cursor always applies only
`00-project-rules.mdc`; other skills use their file patterns or agent request.
Workflow, roles, and minimal implementation instructions link to declared
references instead of injecting those manuals into every task.

Routine documentation tasks select the short workflow. Substantive Build tasks
can also select minimal implementation guidance. Security remains required for
security, migration, and destructive risk, even if a profile excludes it or a
soft budget is too small. Warnings explain those conflicts and overflows.

The experimental MCP loader preserves whole selected bodies and project overrides.
It exposes paths, SHA-256 hashes, sizes, warnings, and selection omissions through
`assembleContextPrompt` and delegation's `context_report`. `buildContextPrompt`
remains a string-returning wrapper. `maxTotalSkillsChars` is now a soft limit;
use `hardLimitChars` to reject an oversized complete prompt. Missing selected
sources fail explicitly. Install required catalog skills before runtime assembly.

The root resolver retains compatibility skill IDs and reports missing installed
manifests. Selection alone does not prove that a body has been loaded. Client
instructions and chat history are outside this skill-body budget.

## Upgrade from core 2.2.0 / MCP 0.3.1

Use a disposable checkout first. Pin both versioned archives; do not use `latest`.
Stop MCP processes while changing their installed package. The default MCP
surface is read-only; remove `--enable-runtime` for the stable inspection scope.

Inspect `git status` and preserve uncommitted work. Keep customization in
`.agents/project/skills`, rather than edited generated files. Modified managed
files refuse replacement; resolve conflicts individually after inspecting diffs.

Prepare a checkpoint **before** npm install or ContextOS update. From the consumer
repository in PowerShell:

```powershell
$ctxRepo = (Get-Location).Path
$ctxCheckpoint = Join-Path $ctxRepo ('contextos-checkpoint-' + (Get-Date -Format yyyyMMdd-HHmmss))
$ctxPaths = @('.agents', '.cursor', '.github', '.zed', 'AGENTS.md', 'CLAUDE.md',
  'GEMINI.md', '.aider.conf.yml', 'CONVENTIONS.md', 'package.json', 'package-lock.json')
New-Item -ItemType Directory -Path $ctxCheckpoint | Out-Null
foreach ($ctxRel in $ctxPaths) {
  $ctxFile = Join-Path $ctxRepo $ctxRel
  if (Test-Path -LiteralPath $ctxFile) {
    Copy-Item -LiteralPath $ctxFile -Destination (Join-Path $ctxCheckpoint $ctxRel) -Recurse
  }
}
npm.cmd pack contextos-agents@2.2.0 --ignore-scripts --pack-destination $ctxCheckpoint
if ($LASTEXITCODE -ne 0) { throw 'Previous core archive unavailable' }
npm.cmd pack @contextos/mcp@0.3.1 --ignore-scripts --pack-destination $ctxCheckpoint
if ($LASTEXITCODE -ne 0) { throw 'Previous MCP archive unavailable' }
```

Keep checkpoint paths and hashes with the upgrade record. A project without npm
lockfile needs its previous exact dependency install recorded separately; the
automated acceptance below verifies npm lockfile rollback. If the lockfile pins a
local archive, retain that archive at its original absolute path for `npm ci`.

Then set the paths to the supplied candidate archives and run:

```powershell
$ctxCoreArchive = 'C:\path\to\contextos-agents-2.3.0.tgz'
$ctxMcpArchive = 'C:\path\to\contextos-mcp-0.4.0.tgz'
npm.cmd install --save-dev --ignore-scripts $ctxCoreArchive $ctxMcpArchive
if ($LASTEXITCODE -ne 0) { throw 'Candidate installation failed' }
$ctxCli = Join-Path $ctxRepo 'node_modules/.bin/contextos.cmd'
foreach ($ctxArgs in @(@('update'), @('compile'), @('validate'), @('export', 'all'),
  @('export', 'all', '--check', '--json'))) {
  & $ctxCli @ctxArgs
  if ($LASTEXITCODE -ne 0) { throw 'ContextOS upgrade check failed; inspect conflicts before continuing' }
}
git diff
```

Inspect root instructions, project overrides and unmanaged Cursor rules. Confirm
native metadata discovery and relevant activation in the client. Run the normal
repository acceptance checks; installation does not prove model adherence.

## Checkpoint rollback

Installing the old CLI alone does not restore generated artifacts, copied engine
modules or lockfiles. Restore the checkpoint configuration and npm lock together.
Preserve post-upgrade edits before rollback; this procedure keeps the entire
upgraded configuration in a second directory for manual reconciliation.

Use the same `$ctxRepo`, `$ctxCheckpoint` and `$ctxPaths`, with all MCP processes
stopped. Run from the consumer repository:

```powershell
$ctxUpgraded = Join-Path $ctxRepo ('contextos-upgraded-' + (Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $ctxUpgraded | Out-Null
foreach ($ctxRel in $ctxPaths) {
  $ctxFile = Join-Path $ctxRepo $ctxRel
  if (Test-Path -LiteralPath $ctxFile) {
    Move-Item -LiteralPath $ctxFile -Destination (Join-Path $ctxUpgraded $ctxRel)
  }
  $ctxSaved = Join-Path $ctxCheckpoint $ctxRel
  if (Test-Path -LiteralPath $ctxSaved) {
    Copy-Item -LiteralPath $ctxSaved -Destination $ctxFile -Recurse
  }
}
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Restore previous archive availability before continuing' }
& (Join-Path $ctxRepo 'node_modules/.bin/contextos.cmd') --version --json
& (Join-Path $ctxRepo 'node_modules/.bin/contextos.cmd') export all --check --json
if ($LASTEXITCODE -ne 0) { throw 'Restored baseline has drift; inspect before adopting' }
```

Reconcile new user rules from `$ctxUpgraded` manually after checking the restored
baseline. Do not restore runtime sessions from a running process or mix runtime
state versions; experimental runtime-state migration is not certified by R2.

## Reproduce migration acceptance

In the trusted ContextOS checkout, build/pack both candidates and download the
previous published pair into `scratch/r2-previous`, then run:

```sh
npm run check:migration
```

The script installs core 2.2.0 / MCP 0.3.1 into a new project with a space in its
path, adds user instructions and project overrides, upgrades both archives,
checks clean export and MCP handshake, then restores configuration and the old
lockfile with `npm ci`. It compares every saved configuration file hash and
checks versions and export drift. Commands, exit codes, output and archive hashes
are in `scratch/release-migration-result.json`; CI retains this as an artifact.
Core 2.2.0 requires a second export to normalize its original Aider YAML; the
fixture verifies that clean baseline before taking the checkpoint.

Codex discovers the shared `.agents/skills` projection from the Gemini export.
ContextOS leaves user-managed root `AGENTS.md` untouched. Native Codex metadata
discovery and explicit full-body injection into the CLI payload are checked
locally. Model adherence and Cursor behavior still require client interaction.

## Model comparisons are paused

The completed calibration is summarized in [benchmark results](BENCHMARK_RESULTS.md).
Further quality, cost and long-session measurements remain paused until an
explicit request. Existing fixed-model results do not establish universal quality
improvement or savings for long client sessions. Migration and release gates make
no paid calls.
