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
