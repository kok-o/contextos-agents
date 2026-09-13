# <img src="./Frame%202.png" height="40" align="absmiddle" /> contextos-agents

[![npm version](https://img.shields.io/npm/v/contextos-agents.svg)](https://www.npmjs.com/package/contextos-agents)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![CI](https://github.com/kok-o/contextos-agents/actions/workflows/validate-skills.yml/badge.svg)](https://github.com/kok-o/contextos-agents/actions/workflows/validate-skills.yml)

**One version-controlled source of engineering rules for supported coding agents.**

ContextOS is a deterministic context and policy compiler for AI coding agents. It transforms your team's version-controlled engineering rules into focused, verifiable context for Gemini, Claude Code, Cursor, GitHub Copilot, Aider, and Zed—and detects configuration drift in CI.

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

1. **Portable:** Define your engineering rules once. ContextOS exports configurations for supported agents (Gemini, Claude Code, Cursor, Copilot, Aider, and Zed).
2. **Focused:** The resolver selects rules and skills relevant to a task so agents receive less unrelated context.
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
      - uses: kok-o/contextos-agents/.github/actions/contextos-gate@v2.0.0
```

## Optional MCP integration (Beta)

The MCP server is a separate beta package. It is not part of the stable `contextos-agents` core.

Install it separately if you want to try the beta integration:

```bash
npm install --save-dev @contextos/mcp
npx contextos-mcp --dir .
```

The MCP server is read-only by default. Runtime execution remains experimental and is outside the stable core scope.

## Security — Third-Party Skills

ContextOS skills are **executable context** — they become part of the system prompt that controls your AI agent's behavior. A malicious skill could instruct the AI agent to exfiltrate environment variables, modify files, or ignore your project's security policies.

> [!CAUTION]
> **Install skills only from repositories you trust as you would trust executable code.** Skills installed via `ctx.js skill add` from npm or GitHub are not sandboxed.

## Contributing

We are open to pull requests! See [CONTRIBUTING.md](./CONTRIBUTING.md) for a step-by-step guide.

## License

Distributed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.
