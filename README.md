<p align="center">
  <a href="https://github.com/kok-o/contextos-agents">
    <img src="./assets/logo.png" alt="ContextOS Logo" width="88" height="88" />
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
  <a href="./docs/product/onboarding.md">Onboarding</a> •
  <a href="./docs/ADAPTER_COMPATIBILITY.md">Adapters</a> •
  <a href="#supported-agents--compilation">Supported Agents</a> •
  <a href="./CONTRIBUTING.md">Contributing</a> •
  <a href="https://www.npmjs.com/package/contextos-agents">npm</a>
</p>

---

ContextOS is a deterministic context and policy compiler for AI coding agents. It exports version-controlled engineering rules and detects configuration drift in CI. See the [adapter compatibility matrix](docs/ADAPTER_COMPATIBILITY.md) for native paths, instruction indexes and manual templates; client loader verification is separate from export tests.

## Installation

You do not need to clone anything manually. Just open your terminal in the root of your project and run:

```bash
npx contextos-agents init
```

By default, ContextOS installs seven core skills: `engineering-workflow`, `ponytail-mindset`, `gemini-precision`, `security`, `context-os`, `context-manager`, and `gstack-roles`, then exports Gemini workspace skills. Supporting examples and references remain separate files. The actual context loaded and session cost depend on your client and task; ContextOS does not control an external client's chat history.

Codex also discovers the shared `.agents/skills` directory. The default Cursor
export always applies only the compact project bootstrap; skill bodies load by
file patterns or agent request. Resolver token budgets are soft: mandatory safety
guidance survives with an overflow warning. The experimental MCP prompt assembler
keeps selected bodies whole and can reject an explicit hard character limit.

Want more skills right away? Install pre-packaged presets or the entire catalog:

```bash
npx contextos-agents init --preset frontend   # React, Next.js, TypeScript, UI/UX, a11y
npx contextos-agents init --preset backend    # System design, API design, Node.js, databases
npx contextos-agents init --preset devops     # Docker, CI/CD, Terraform
npx contextos-agents init --all               # Install all 36 catalog skills at once
```

### Options

Try the [small local demo](examples/quickstart/README.md) to install the package in a new folder, select a TypeScript skill, and add a team rule without
calling a model API. The [five-minute guide](docs/product/onboarding.md) explains
the same workflow for an existing project.

Core 2.3.0 and MCP 0.4.0 are published. See the [release status](docs/R2_RELEASE_PREPARATION.md)
and [upgrade/checkpoint rollback](docs/COMPACT_CONTEXT_MIGRATION.md). The
[release manifest](docs/evidence/release-2.3.json) records the released source,
cross-platform CI and archive identities. Automatic client routing and the external
pilot remain unverified. Internal plans, local API probes and raw logs are excluded
from the public release surface.

```bash
npx contextos-agents --help             # Show all options
npx contextos-agents --version          # Show version
npx contextos-agents --minimal          # Install only the core bootstrap skills
npx contextos-agents --all              # Install all 36 catalog domain skills during init
npx contextos-agents --preset <name>    # Install stack preset: frontend, backend, devops, full
npx contextos-agents --profile init     # Install with specific profile
npx contextos-agents --auto             # Auto-detect tech stack and apply recommended profile
npx contextos-agents --dry-run          # Preview what will be installed
npx contextos-agents --force            # Overwrite an existing .agents/ folder
npx contextos-agents --skip-compile     # Skip auto-compilation step
```

## Why ContextOS?

Modern development teams face fragmented AI tooling: engineers use Cursor, Claude Code, GitHub Copilot, Gemini, Zed, and Aider. Each tool requires its own proprietary rules format, leading to configuration drift, contradictory standards, and unvetted AI slop (`// TODO`, leaked secrets).

ContextOS preserves selected skill bodies and reports budget overflow instead of silently truncating required instructions. Whether a client loads and follows those rules requires separate verification. The current [calibration](docs/BENCHMARK_RESULTS.md) found no quality advantage over vanilla on its test corpus.

**ContextOS is not another coding agent.** It is the deterministic context compiler and policy engine for the agents your team already uses.

### The Three Pillars

1. **Portable (Multi-Agent):** Define your engineering skills once in standard Markdown. ContextOS generates agent-specific exports (Gemini, Claude Code, Cursor, Copilot, Aider, and Zed); native loading and manual templates are distinguished in the compatibility matrix.
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

Example excerpt from the repository configuration (selection and scores depend on installed skills, files and profile):

```text
Selected Skills:
  ✓ engineering-workflow   score: 100  tokens: ~418  (foundation: Core skill)
  ✓ security               score: 185  tokens: ~2237  (safety_required: Touched file "src/auth/session.ts" matches glob "**/*auth*" (+25); safety_required: Touched file "src/auth/session.ts" matches pattern (+60); safety_required: Required safety guidance for high risk task)
  ✓ typescript             score:  60  tokens: ~1000  (file_glob: Touched file "src/auth/session.ts" matches pattern (+60))
```

Selection does not imply installation or activation. If TypeScript is not installed, the CLI also reports `CTX_SELECTED_SKILL_UNAVAILABLE`; install it with `contextos skill add typescript` before runtime assembly.

## Dynamic Skill Resolution & Unified CLI (`contextos` / `ctx.js`)

ContextOS provides a unified CLI (`contextos` or `npx contextos-agents`) and local engine (`.agents/ctx.js`) to resolve minimal skills on the fly, run health diagnostics, and compile exports for AI assistants.

### Dynamic Skill Resolution (`resolve`)

```bash
# Resolve skills for a task description:
contextos resolve "Build an accessible modal component with React and Tailwind"

# Output:
# [DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer] [MODE: CHANGE] [LENSES: accessibility] [RISK: standard]
# Skills loaded: ponytail-mindset, engineering-workflow, react, web-accessibility, ui-ux-pro
# Selection declaration only; skill bodies are read by the consuming client or prompt assembler.

# Resolve with full evidence scoring explanation:
contextos resolve "security review" --files apps/web/app/login/page.tsx --explain
```

### Skill & Catalog Management (`contextos skill`)

Discover, install, and customize skills:

```bash
# Explore all available catalog skills (36 domain skills):
contextos skill list --available

# Install a specific skill from the catalog (with typo suggestions):
contextos skill add fastapi

# Install all 36 catalog skills at once:
contextos skill add --all

# Fork a built-in skill into your project for team customizations:
contextos skill override gemini-precision

# Diff your local customizations against upstream updates:
contextos skill diff gemini-precision

# Eject a skill to decouple it from upstream updates:
contextos skill eject gemini-precision
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

### Staged Index Security Scanner (`contextos scan`)

Scan staged changes directly from the Git index for secret leaks, blocked credential files, unfinished lazy stubs, and write-scope containment:

```bash
contextos scan --staged --enforce
contextos scan --staged --placeholders --scope .agents/task-scope.json --json
```

### Safe Git Pre-Commit Hooks (`contextos hook`)

Install or remove isolated pre-commit hooks that run fast security checks without clobbering existing developer hooks:

```bash
contextos hook install
contextos hook uninstall
```

### CI Quality Gate (`contextos gate`)

Check that generated adapter files match source skills and the active profile:

```bash
contextos gate
```

This is a configuration drift gate. Run your application's tests, typecheck and security checks separately. `resolve` recommends skills for a task; ordinary exports use all installed skills allowed by the profile. Resolver budgets are soft estimates of selected skill bodies and exclude client instructions, chat history and tool output.

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
      - uses: kok-o/contextos-agents/.github/actions/contextos-gate@v2.3.0
        with:
          version: '2.3.0'       # Pinned version of contextos-agents runner
          adapters: 'all'        # Adapters to verify (or specific: 'cursor', 'claude')
          working-directory: '.' # Project root directory
```

Keep the explicit `version` above: the existing `v2.3.0` action tag defaults to CLI 2.2.0. Updating the action source does not change that tag; users must set `version` or move to a future fixed tag.

The action executes the verified ContextOS quality gate in-process from the pinned package version, verifying generated AI adapter configs against source skills without executing untrusted scripts from pull requests, and without requiring a Node.js project or running `npm test`.

## Optional MCP integration (Beta)

The MCP server is a separate beta package. It is not part of the stable `contextos-agents` core.

Install it separately if you want to try the beta integration:

```bash
npm install --save-dev contextos-mcp
npx contextos-mcp --dir .
```

The former `@contextos/mcp` 0.3.x package is historical; use `contextos-mcp` for current releases.

The MCP server is read-only by default. Runtime execution remains experimental and is outside the stable core scope.

## Security - Third-Party Skills

ContextOS skills are **executable context** - they become part of the system prompt that controls your AI agent's behavior. A malicious skill could instruct the AI agent to exfiltrate environment variables, modify files, or ignore your project's security policies.

> [!CAUTION]
> **Install skills only from repositories you trust as you would trust executable code.** Skills installed via `ctx.js skill add` from npm or GitHub are not sandboxed.

## Contributing

We are open to pull requests! See [CONTRIBUTING.md](./CONTRIBUTING.md) for a step-by-step guide.

## License

Distributed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.
