# ContextOS Migration Guide

This document outlines how to upgrade to major versions of ContextOS and adapt to structural breaking changes.

## Upgrading to v2.0 (The Context Governance Release)

ContextOS v2.0 fundamentally reframes the project from an "Autonomous AI Swarm" to an **Agent Context Governance** engine. This brings several breaking changes to improve security, lower installation overhead, and prevent prompt bloat.

### 1. The MCP Runtime is Now a Separate Package
In v1.x, the ContextOS MCP server and execution runtime were bundled inside the core `contextos-agents` package.

**What changed:**
* The core package (`contextos-agents`) is now purely a deterministic compiler and rule resolver.
* The MCP server, sub-agent execution, and worktree logic have been moved to a separate Beta package (`@contextos/mcp`).
* The `--with-mcp` CLI flag on `contextos init` is **deprecated** and will only print instructions to install the new package.

**Migration:**
If you rely on ContextOS MCP for parallel worktrees or execution:
```bash
# Install the runtime separately
npm install @contextos/mcp --save-dev

# Use the new explicit runtime flag in your IDE's MCP config
# (Instead of pointing to .agents/mcp/server.mjs)
npx contextos-mcp --enable-runtime
```

### 2. Opinionated Skills Moved to Optional Catalog
In v1.x, a standard installation included ~39 skills ranging from `react` to `brutalist-design`. This caused bloat for users who just wanted basic engineering rules.

**What changed:**
* The default installation now only applies a **Neutral Bootstrap** (core workflows, security, context management).
* Framework-specific (React, FastAPI) and design-specific (Impeccable Design, Soft Design) skills are no longer included in the default `init` payload.

**Migration:**
* **Existing projects:** Your existing `.agents/core/skills/` folder will **not** be automatically deleted when you run `contextos update`. You will keep what you have.
* **Cleaning up:** If you want to remove the old skills that are no longer part of the default profile, run:
  ```bash
  contextos profile prune
  ```
* **Adding them back:** If you are setting up a new project and want the React or UI skills, you must install them explicitly from the catalog.

### 3. GitHub Action (contextos-gate) Migration to In-Process Gate Runner

In v1.x, the composite action ran `npm ci --ignore-scripts`, executed the incoming pull request's `.agents/ctx.js`, and executed `npm test` inside the consumer project.

**What changed:**
* **Security & Isolation**: The gate runner now executes in-process from the pinned package version (`contextos gate`). Incoming pull requests cannot execute untrusted scripts or rogue `.agents/ctx.js`.
* **Non-Node Repositories**: The gate no longer requires `package.json`, `npm ci`, or `npm test`. Repositories in Python, Go, Rust, or documentation trees are supported as first-class consumers.
* **Granular Adapters**: The action supports `adapters: 'all'` (default) or scoped adapter lists (e.g. `cursor`, `claude,gemini`).
* **Secrets Scanning Decoupled**: Built-in secret scanning in the gate action is `not_configured` in v2.0 (scheduled for Phase 5). To avoid silent false security guarantees, requesting `skip-secrets: 'false'` or `require-secrets: 'true'` fails closed with exit code 2. Use dedicated security scanners (such as `gitleaks/gitleaks-action`) in your CI pipeline.

**Migration:**
Update your `.github/workflows/` workflow step:
```yaml
- uses: kok-o/contextos-agents/.github/actions/contextos-gate@v2.1.1
  with:
    version: '2.1.1'
    adapters: 'all'
    working-directory: '.'
```

If you previously relied on ContextOS Gate for secret scanning, add a dedicated scanner action to your workflow:
```yaml
- name: Secret Scanning
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
