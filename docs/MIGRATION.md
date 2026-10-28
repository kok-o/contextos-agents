# ContextOS Migration Guide

This document outlines how to upgrade to major versions of ContextOS and adapt to structural breaking changes.

The current checkout prepares **core 3.0.0**, which is not published.
Use the [reviewed local archive](RELEASE_3.0.0.md#try-the-prepared-archive); MCP is not part of this migration.

For the historical core 2.2.0 / MCP 0.3.1 → core 2.3.0 / MCP 0.4.0 releases,
use the [concrete upgrade and checkpoint rollback guide](COMPACT_CONTEXT_MIGRATION.md).
The sections below describe older migrations.

The core 2.3.2 / MCP 0.4.2 maintenance update is described in the
[patch checklist](archive/PATCH_RELEASE_2.3.2.md). The previous published pair is recorded
in [the 2.3.1 checklist](archive/PATCH_RELEASE_2.3.1.md).

<a id="upgrading-from-2x-projects"></a>

## Upgrading from 2.x projects to 3.0.0

Projects initialized by 2.x contain a full copy of the tool in `.agents/`
(adapters, compiler, resolver, about a hundred files) and, with older defaults,
the seven bundled core skills. The current version runs the tool from
`node_modules` and keeps only your rules, the lockfile and the generated files in
the project. One command moves an existing project over:

```sh
npm install --save-dev --save-exact /path/to/contextos-agents-3.0.0.tgz
npx --no-install contextos update --dry-run   # review the plan
npx --no-install contextos update
npx --no-install contextos export all --check --json
git diff --stat                         # review, then commit
```

`update`:

- **removes tool code that 2.x copied** (`.agents/ctx.js`, `adapters/`,
  `compiler/`, `resolver/`, `schemas/` and so on) and the copy of the skill
  catalog, but only files that still match what 2.x installed. A copy your team
  edited is kept and reported;
- **refreshes the bundled core files** (`.agents/core/`, `.agents/AGENTS.md`) only
  if the project already has them. It never adds the bundle to a project that
  does not use it;
- adds the `.gitignore` block for `.agents/compiled/` and `.agents/.contextos/`
  (run `git rm -r --cached .agents/compiled` if the cache was committed);
- **re-exports** the agent files the project already exports.

What changes in the generated files, and why:

| Before | Now |
| --- | --- |
| `CLAUDE.md` held a block of links; `.agents/generated/claude/skills/` held copies | Claude Code reads `.claude/rules/` and `.claude/skills/`. The old block is removed from `CLAUDE.md` (your own text stays; a file that held only the block is deleted) and the old copies are pruned. |
| Every generated file carried a hash of all sources in its header; the lockfile had a revision counter, timestamps and per-file source hashes | Headers name the generator and profile only; the lockfile is sorted and changes only when a file's content changes. The first export after upgrading rewrites them once; later edits touch far fewer lines and merge cleanly. |
| Aider, Zed and Copilot outputs always included the ContextOS operating rules | They are included only when the project has its own `.agents/AGENTS.md` (installed by `init --with-core`). |
| `uninstall` ran immediately | `uninstall` prints its plan and needs `--yes`. It now removes generated files, managed blocks, lockfiles, caches and the `.gitignore` block, and keeps `.agents/project/`. |
| `init --force` replaced `.agents/` | `init --force` only refreshes the bundled files and deletes nothing. |

To roll back, check out the previous commit and reinstall the previous package
version from your package lockfile (`npm ci`). The installed-package migration
check in CI upgrades a project from the previous release and restores it this
way byte for byte.

## Upgrading to v2.0 (The Context Governance Release)

ContextOS v2.0 fundamentally reframes the project from an "Autonomous AI Swarm" to an **Agent Context Governance** engine. This brings several breaking changes to improve security, lower installation overhead, and prevent prompt bloat.

### 1. The MCP Runtime is Now a Separate Package

In v1.x, the ContextOS MCP server and execution runtime were bundled inside the core `contextos-agents` package.

**What changed:**

- The core package (`contextos-agents`) is now purely a deterministic compiler and rule resolver.
- The MCP server, sub-agent execution, and worktree logic have been moved to a separate Beta package (`contextos-mcp`, formerly `@contextos/mcp`).
- The `--with-mcp` CLI flag on `contextos init` is **deprecated** and will only print instructions to install the new package.

**Migration:**
If you rely on ContextOS MCP for parallel worktrees or execution:

```bash
# Install the runtime separately
npm install contextos-mcp --save-dev

# Use the new explicit runtime flag in your IDE's MCP config
# (Instead of pointing to .agents/mcp/server.mjs)
npx contextos-mcp --enable-runtime
```

### 2. Opinionated Skills Moved to Optional Catalog

In v1.x, a standard installation included ~39 skills ranging from `react` to `brutalist-design`. This caused bloat for users who just wanted basic engineering rules.

**What changed:**

- The default installation now only applies a **Neutral Bootstrap** (core workflows, security, context management).
- Framework-specific (React, FastAPI) and design-specific (Impeccable Design, Soft Design) skills are no longer included in the default `init` payload.

**Migration:**

- **Existing projects:** Your existing `.agents/core/skills/` folder will **not** be automatically deleted when you run `contextos update`. You will keep what you have.
- **Cleaning up:** If you want to remove the old skills that are no longer part of the default profile, run:

  ```bash
  contextos profile prune
  ```

- **Adding them back:** If you are setting up a new project and want the React or UI skills, you must install them explicitly from the catalog.

### 3. GitHub Action (contextos-gate) Migration to In-Process Gate Runner

In v1.x, the composite action ran `npm ci --ignore-scripts`, executed the incoming pull request's `.agents/ctx.js`, and executed `npm test` inside the consumer project.

**What changed:**

- **Security & Isolation**: The gate runner now executes in-process from the pinned package version (`contextos gate`). Incoming pull requests cannot execute untrusted scripts or rogue `.agents/ctx.js`.
- **Non-Node Repositories**: The gate no longer requires `package.json`, `npm ci`, or `npm test`. Repositories in Python, Go, Rust, or documentation trees are supported as first-class consumers.
- **Granular Adapters**: The action supports `adapters: 'all'` (default) or scoped adapter lists (e.g. `cursor`, `claude,gemini`).
- **Secrets Scanning Decoupled**: Built-in secret scanning in the gate action is `not_configured` in v2.0 (scheduled for Phase 5). To avoid silent false security guarantees, requesting `skip-secrets: 'false'` or `require-secrets: 'true'` fails closed with exit code 2. Use dedicated security scanners (such as `gitleaks/gitleaks-action`) in your CI pipeline.

**Migration:**
Update your `.github/workflows/` workflow step:

```yaml
- uses: kok-o/contextos-agents/.github/actions/contextos-gate@v3.0.0
  with:
    version: '3.0.0'
    adapters: 'all'
    working-directory: '.'
```

The example targets the future v3.0.0 tag and CLI package and becomes usable
only after both are published. For this unpublished candidate, run
`npx --no-install contextos gate --target all` locally instead. The older `v2.3.0`
action tag defaults to CLI 2.2.0, so retain an explicit `version` when using it.

If you previously relied on ContextOS Gate for secret scanning, add a dedicated scanner action to your workflow:

```yaml
- name: Secret Scanning
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
