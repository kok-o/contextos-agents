<p align="center">
  <a href="https://github.com/kok-o/contextos-agents">
    <img src="./Frame%202.png" alt="ContextOS Logo" width="88" height="88" />
  </a>
</p>

<h1 align="center">contextos-agents</h1>

<p align="center">
  <strong>One version-controlled source of engineering rules for supported coding agents.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/contextos-agents"><img src="https://img.shields.io/npm/v/contextos-agents?color=18181b&logo=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/contextos-agents"><img src="https://img.shields.io/npm/dt/contextos-agents?color=18181b&logo=npm&label=downloads" alt="npm downloads" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22.0.0-18181b?logo=node.js" alt="Node.js" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-18181b" alt="License" /></a>
  <a href="https://github.com/kok-o/contextos-agents/actions/workflows/validate-skills.yml"><img src="https://img.shields.io/github/actions/workflow/status/kok-o/contextos-agents/validate-skills.yml?label=ci&color=18181b&logo=github" alt="CI" /></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="./GUIDE.md">Guide</a> •
  <a href="#supported-agents--compilation">Supported Agents</a> •
  <a href="./CONTRIBUTING.md">Contributing</a> •
  <a href="https://www.npmjs.com/package/contextos-agents">npm</a>
</p>

---

ContextOS is a deterministic context and policy compiler for AI coding agents. It transforms your team's version-controlled engineering rules into focused, verifiable context for Gemini, Claude Code, Cursor, GitHub Copilot, Aider, and Zed - and detects configuration drift in CI.

## Installation

You do not need to clone anything manually. Just open your terminal in the root of your project and run:

```bash
npx contextos-agents init
```

The script will automatically detect your project tech stack, create the `.agents` folder, configure a neutral bootstrap profile, and compile it for your AI agent.

### Options

```bash
npx contextos-agents --help             # Show all options
npx contextos-agents --version          # Show version
npx contextos-agents --minimal          # Install only the core bootstrap skills
npx contextos-agents --profile init     # Install with specific profile
npx contextos-agents --auto             # Auto-detect tech stack and apply recommended profile
npx contextos-agents --dry-run          # Preview what will be installed
npx contextos-agents --force            # Overwrite an existing .agents/ folder
npx contextos-agents --skip-compile     # Skip auto-compilation step
```

## Why ContextOS?

Modern development teams face fragmented AI tooling: engineers use Cursor, Claude Code, GitHub Copilot, Gemini, Zed, and Aider. Each tool requires its own proprietary rules format, leading to configuration drift, contradictory standards, and unvetted AI slop (`// TODO`, leaked secrets).

Artificially truncating skills to save tokens degrades model reasoning and induces hallucinations. Instead, ContextOS ensures that agents receive complete, high-fidelity engineering context from a single version-controlled source.

**ContextOS is not another coding agent.** It is the deterministic context compiler and policy engine for the agents your team already uses.

### The Three Pillars

1. **Portable (Multi-Agent):** Define your engineering skills once in standard Markdown. ContextOS compiles native configurations for all supported agents (Gemini, Claude Code, Cursor, Copilot, Aider, and Zed).
2. **High-Fidelity & Focused:** The resolver maps domain skills to relevant tasks without lossy truncation, delivering rich, complete context to the model.
3. **Verifiable in CI:** Lockfile v2 provenance, dual-hash verification, and CI quality gates detect configuration drift and enforce quality guardrails before merge.

## How it works

1. Define version-controlled engineering policies once.
2. Resolve the complete, relevant skill policies for the current task.
3. Compile native configuration for each coding agent.
4. Detect configuration drift and policy violations in CI.

```bash
contextos resolve "review authentication changes" \
  --files src/auth/session.ts \
  --explain
```

Selected:
  security              explicit task match
  engineering-workflow  required dependency

Excluded:
  context-manager       domain relevance filter

Risk: high
Context status: complete and verified

## Dynamic Skill Resolution & Unified CLI (`contextos` / `ctx.js`)

ContextOS provides a unified CLI (`contextos` or `npx contextos-agents`) and local engine (`.agents/ctx.js`) to resolve minimal skills on the fly, run health diagnostics, and compile exports for AI assistants.

### Dynamic Skill Resolution (`resolve`)

```bash
# Resolve skills for a task description:
contextos resolve "Build an accessible modal component with React and Tailwind"

# Output:
# [DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer]
# Skills loaded: ponytail-mindset, engineering-workflow, gemini-precision

# Resolve with full evidence scoring explanation:
contextos resolve "security review" --files apps/web/app/login/page.tsx --explain
```

### Diagnostic Health Check (`contextos doctor`)

Run a comprehensive pre-flight verification across your repository to ensure valid skills, profile alignment, and compiler synchronization:

```bash
contextos doctor
```

### Supported Agents & Compilation

| Agent | Command | Output Format |
|-------|---------|---------------|
| **Gemini / Antigravity** | `contextos export gemini` | `.agents/generated/gemini/skills/` |
| **Claude Code** | `contextos export claude` | `.agents/generated/claude/skills/` |
| **Cursor IDE** | `contextos export cursor` | `.cursor/rules/*.mdc` (modular globs) + `.cursorrules` |
| **GitHub Copilot** | `contextos export copilot` | `.github/copilot-instructions.md` |
| **Aider** | `contextos export aider` | `.aider.conf.yml` + `CONVENTIONS.md` |
| **Zed IDE** | `contextos export zed` | `.zed/rules.md` + `.zed/prompts/*.md` |

```bash
contextos export all       # Compile for all agents
```

### CI Quality Gate Action (contextos-gate)

Guard your repository against skill drift, missing outputs, and rule regressions using the official GitHub Composite Action:

```yaml
# .github/workflows/pr-gate.yml
name: ContextOS Quality Gate
on: [pull_request, push]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: kok-o/contextos-agents/.github/actions/contextos-gate@v2.0.0
        with:
          version: '2.0.0'       # Pinned version of contextos-agents runner
          adapters: 'all'        # Adapters to verify (or specific: 'cursor', 'claude')
          working-directory: '.' # Project root directory
```

The action executes the verified ContextOS quality gate in-process from the pinned package version, verifying generated AI adapter configs against source skills without executing untrusted scripts from pull requests, and without requiring a Node.js project or running `npm test`.

## Optional MCP integration (Beta)

The MCP server is a separate beta package. It is not part of the stable `contextos-agents` core.

Install it separately if you want to try the beta integration:

```bash
npm install --save-dev @contextos/mcp
npx contextos-mcp --dir .
```

The MCP server is read-only by default. Runtime execution remains experimental and is outside the stable core scope.

## Security - Third-Party Skills

ContextOS skills are **executable context** - they become part of the system prompt that controls your AI agent's behavior. A malicious skill could instruct the AI agent to exfiltrate environment variables, modify files, or ignore your project's security policies.

> [!CAUTION]
> **Install skills only from repositories you trust as you would trust executable code.** Skills installed via `ctx.js skill add` from npm or GitHub are not sandboxed.

## Contributing

We are open to pull requests! See [CONTRIBUTING.md](./CONTRIBUTING.md) for a step-by-step guide.

## License

Distributed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.
