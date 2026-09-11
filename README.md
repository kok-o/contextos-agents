# <img src="./Frame%202.png" height="40" align="absmiddle" /> contextos-agents

[![npm version](https://img.shields.io/npm/v/contextos-agents.svg)](https://www.npmjs.com/package/contextos-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![CI](https://github.com/kok-o/contextos-agents/actions/workflows/validate-skills.yml/badge.svg)](https://github.com/kok-o/contextos-agents/actions/workflows/validate-skills.yml)

**One source of truth for every coding agent.**

ContextOS is a deterministic context and policy compiler for AI coding agents. It transforms your team's version-controlled engineering rules into a minimal, verifiable context payload for Cursor, Claude Code, GitHub Copilot, Aider, and Zed—and detects configuration drift in CI.

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

Most AI coding assistants suffer from two extremes: they either operate in a vacuum with zero knowledge of your architectural standards, or they are choked with massive monolithic system prompts that cause context overflow and lazy code stubs (`// TODO`).

**ContextOS is not another coding agent.** It governs the context and policies used by the agents your team already has.

### The Three Pillars

1. **Portable:** Define your engineering rules once. ContextOS exports optimized configurations for all major AI editors (Cursor, Claude Code, Copilot, Aider, Zed).
2. **Minimal:** The dynamic resolver selects only the relevant skills and rules needed for a specific task, eliminating prompt bloat and token waste.
3. **Verifiable:** Lockfiles, provenance, drift detection, and CI gates make generated agent configuration reproducible and auditable.

## How it works

1. Define version-controlled engineering policies once.
2. Resolve only the policies relevant to the current task.
3. Compile native configuration for each coding agent.
4. Detect configuration drift in CI.

```bash
contextos resolve "review authentication changes" \
  --files src/auth/session.ts \
  --explain
```

Selected:
  security              explicit task match
  engineering-workflow  required dependency

Excluded:
  context-manager       context budget

Risk: high
Estimated context: 2,840 tokens

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

### CI Quality Gate Action (`contextos-gate`)

Guard your repository against skill drift, secret leaks, and rule regressions using the official GitHub Composite Action:

```yaml
# .github/workflows/pr-gate.yml
name: ContextOS Quality Gate
on: [pull_request, push]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: kok-o/contextos-agents/.github/actions/contextos-gate@main
```

## ContextOS MCP Bridge (Beta)

ContextOS provides a read-only **Model Context Protocol (MCP)** server to allow compatible agents (like Claude Desktop) to dynamically read project rules, resolve context, and check project status.

> [!WARNING]
> **Separation of Concerns:** The MCP Bridge and experimental runtime orchestration tools are distributed separately in the `@contextos/mcp` package (Beta). The `--with-mcp` flag in the Core CLI is deprecated.

Install the optional MCP Bridge:

`ash
npm install --save-dev @contextos/mcp
npx contextos-mcp --dir .
`

The MCP Bridge is read-only by default. Experimental execution tools require
the explicit --enable-runtime flag and should only be used in trusted repositories.

## Security — Third-Party Skills

ContextOS skills are **executable context** — they become part of the system prompt that controls your AI agent's behavior. A malicious skill could instruct the AI agent to exfiltrate environment variables, modify files, or ignore your project's security policies.

> [!CAUTION]
> **Install skills only from repositories you trust as you would trust executable code.** Skills installed via `ctx.js skill add` from npm or GitHub are not sandboxed.

## Contributing

We are open to pull requests! See [CONTRIBUTING.md](./CONTRIBUTING.md) for a step-by-step guide.

## License

Distributed under the MIT License. You can freely use, modify, and distribute this code.
