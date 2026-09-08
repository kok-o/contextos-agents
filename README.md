# <img src="./Frame%202.png" height="40" align="absmiddle" /> contextos-agents

[![npm version](https://img.shields.io/npm/v/contextos-agents.svg)](https://www.npmjs.com/package/contextos-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#testing)

This is an open-source set of skills and behavioral rules for AI assistants. The package automatically installs an `.agents` folder into your project, teaching your AI assistant software development best practices (UI Design, Architecture, Security, and more).

## Installation

You do not need to clone anything manually. Just open your terminal in the root of your project and run:

```bash
npx contextos-agents init
```

The script will automatically detect your project tech stack, create the `.agents` folder, configure skills, and compile them for your AI agent.

### Options

```bash
npx contextos-agents --help             # Show all options
npx contextos-agents --version          # Show version
npx contextos-agents --minimal          # Install only 5 core skills (lightweight footprint)
npx contextos-agents --profile mvp      # Install with specific profile (mvp, startup, enterprise, frontend, backend)
npx contextos-agents --auto             # Auto-detect tech stack and apply recommended profile
npx contextos-agents --with-mcp         # Install with MCP execution server enabled (.agents/mcp/)
npx contextos-agents setup-mcp          # Add MCP server to an existing .agents/ project
npx contextos-agents --dry-run          # Preview what will be installed
npx contextos-agents --force            # Overwrite an existing .agents/ folder
npx contextos-agents --skip-compile     # Skip auto-compilation step
```

## Why ContextOS?

Most AI coding assistants suffer from two extremes: they either operate in a vacuum with zero knowledge of your architectural standards, or they are choked with massive monolithic system prompts that cause context overflow, hallucinated dependencies, and lazy code stubs (`// TODO`).

**ContextOS transforms chaotic AI code generation into a disciplined, senior-level software engineering team.**

### The Problem vs. The Solution

| Without ContextOS (Everyday AI Frustrations) | With ContextOS (Engineering Discipline) |
|---|---|
| **Prompt Bloat & Token Waste:** Pasting giant system prompts burns tokens, slows responses, and degrades reasoning. | **Dynamic Context Resolution:** Dynamically resolves only 2–3 required skills per task (`ctx.js resolve`), saving up to 70–80% in prompt tokens. |
| **Lazy Code & Slop:** Output full of `// TODO: implement later`, missing imports, and broken refactorings. | **Zero-Placeholder Invariant:** Strict guardrails enforce 100% complete, drop-in ready code with verified syntax and error boundaries. |
| **Tool Zoo Fragmentation:** Inconsistent rules across Cursor (`.cursorrules`), Zed (`.zed/`), Aider, and Claude Code. | **Single Source of Truth:** Author skills once in markdown; ContextOS exports optimized configurations for all major AI editors (`ctx.js export all`). |
| **Destructive File Rewrites:** Agents overwrite hundreds of lines without reading existing code first. | **Surgical Blast Radius & Sandboxing:** Changes are confined to planned lines or executed safely in isolated Git worktrees via ContextOS MCP. |
| **"Black Box" Hallucinations:** You only see the start and end, with no insight into the agent's decisions. | **Transparent Pair Programming:** The agent outlines technical decisions, adheres to strict phases (DEFINE → PLAN → BUILD → VERIFY), and proves work with test runs. |

### Key Developer Advantages

- **Zero-Config Onboarding:** Run `npx contextos-agents` in your repository. It auto-detects your stack (React, Node, Python, etc.) and sets up the ideal profile in seconds.
- **Tailored Project Profiles:** Use `mvp` for lean, rapid prototyping without bloated microservices boilerplate, or `enterprise` for strict TDD, DDD, and security auditing.
- **Autonomous Multi-Agent Worktrees:** Run parallel tasks safely with the bundled MCP server—subagents work in isolated Git worktrees without corrupting your active workspace.
- **Verifiable Benchmarks:** Backed by reproducible side-by-side benchmarks demonstrating measurable code quality improvements and reduced token usage.

## Project Profiles & Stack Auto-Detection

ContextOS allows you to tailor your AI rules to the project lifecycle and architecture:

| Profile | Focus | Excluded / Filtered Skills | Ideal For |
|---|---|---|---|
| `mvp` | Maximum speed & minimalism | `microservices`, `ddd`, `cqrs`, `kubernetes` | Hackathons, prototypes, fast validation |
| `startup` | Balanced agile stack | `microservices`, `kubernetes` | SaaS startups, modular monoliths |
| `enterprise` | Maximum rigor & compliance | _(none)_ — full TDD, DDD, Security Audit | Large scale teams, strict audit requirements |
| `frontend` | Dedicated UI/UX & React | `fastapi`, `nestjs`, `microservices`, `ddd` | Next.js, React, Design systems, SPAs |
| `backend` | Server-side & APIs | `ui-ux-pro`, `impeccable-design`, `ui-design` | API servers, microservices, databases |

### Profile Commands

```bash
# Auto-detect tech stack in the current project
contextos detect
# or: node .agents/ctx.js detect

# List available profiles and current active profile
contextos profile list

# Apply a profile
contextos profile apply mvp

# Recompile all agent exports for the active profile
contextos export all
```

## What's Inside?

### Master Orchestrator

- **AGENTS.md** — The core ruleset. Automatically routes skills by task type and technology detected in your codebase.

### Skills (39 total)

| Category | Skill | What It Does |
| ---------- | ------- | ------------- |
| Core | `engineering-workflow` | Enforces DEFINE→PLAN→BUILD→VERIFY→REVIEW→SHIP pipeline and slash commands |
| Core | `gstack-roles` | 23 specialist roles (PM, Architect, QA Lead, etc.) — AI declares its role before each task |
| Core | `ponytail-mindset` | 7-rung decision ladder before writing any code. Eliminates premature abstraction |
| Core | `interview-me` | Progressive single-question requirements elicitation before drafting specs |
| Core | `subagent-orchestrator` | Multi-agent task decomposition, context boundary isolation, and merge synthesis |
| Core | `gemini-precision` | High-precision engineering guardrails, zero-assumption verification, and zero-placeholder output |
| Frontend | `ui-ux-pro` | Planning guide for UI: color systems, typography, Tailwind v4 `@theme`, Framer Motion |
| Frontend | `impeccable-design` | 50 deterministic QA rules for design review (typography, color, layout, animation) |
| Frontend | `react` | Modern React 19, concurrency, state colocation, `useOptimistic`, and render optimization |
| Frontend | `react-best-practices` | Vercel engineering standards, eliminating async waterfalls, bundle trace optimization |
| Frontend | `nextjs` | Next.js 15+ App Router, RSC, `after()`, `React.cache()`, Server Actions, and PPR |
| Frontend | `typescript` | Type-safe code, generics, config, and invariant type assertions |
| Frontend | `state-management` | Zustand, TanStack Query, client/server state separation |
| Frontend | `ui-design` | Component library design, design tokens, and shadcn/ui patterns |
| Frontend | `ux-design` | User flow design, interaction patterns, and user journey optimization |
| Frontend | `web-accessibility` | ARIA dialogs, focus traps, WCAG 2.1 compliance, and `:focus-visible` standards |
| Frontend | `brutalist-design` | Raw mechanical interfaces, Swiss print typography, and high-contrast styling |
| Frontend | `minimalist-design` | Clean, content-first editorial interfaces with generous negative space |
| Frontend | `soft-design` | Warm, low-contrast premium surfaces with subtle atmospheric depth |
| Frontend | `redesign-audit` | Systematic UI codebase auditing and refactoring without breaking existing features |
| Backend | `system-design` | DDIA patterns (Outbox, CDC, Idempotency), serverless pooling, and CAP trade-offs |
| Backend | `database` | Zero-downtime migrations (expand/contract), PostgreSQL indexing, and serverless pooling |
| Backend | `node` | Node.js asynchronous event loop and server runtime best practices |
| Backend | `fastapi` | FastAPI and Pydantic v2 high-performance Python backends |
| Backend | `nestjs` | Enterprise modular backend architecture and dependency injection |
| Backend | `microservices` | Service boundaries, Saga orchestration/choreography, and Dead Letter Queues |
| Backend | `ddd` | Domain-Driven Design, Aggregate invariants, Domain Events, and Clean Architecture |
| Cross | `security` | Zero-trust auth, OWASP API Top 10, SSRF IP blocking, and Prompt Injection defense |
| Cross | `performance` | Core Web Vitals 2026 (INP < 200ms, LCP < 2.5s), waterfall elimination |
| Cross | `vercel-optimize` | Edge caching, stale-while-revalidate, and Vercel platform optimizations |
| Cross | `testing` | Vitest, React Testing Library behavior testing, and Playwright E2E suites |
| Cross | `docker` | Multi-stage Dockerfiles, non-root security, and container standards |
| Cross | `decisions` | Architectural Decision Records (ADR) format and evaluation |
| Cross | `architecture-diagrams` | Animated, interactive SVG/HTML architecture, sequence, and data-flow diagrams |
| Cross | `adapters` | Multi-agent system export and configuration generation |
| Cross | `generators` | Automated PRD, Architecture, and Task generation |
| Cross | `context-manager` | Smart context token selection and optimization |
| Cross | `context-os` | ContextOS compiler meta-skill |
| Cross | `graphify` | Codebase knowledge graph, Tree-sitter AST dependency mapping, and blast-radius analysis |

## Slash Command Workflows

ContextOS maps development phases directly to slash commands in your AI chat:

| Command | Role Activated | What It Does |
|:---|:---|:---|
| `/spec` | Product Manager | Turn vague ideas into structured requirements and acceptance criteria |
| `/plan` | Architect | Decompose the spec into atomic, testable tasks (< 2 hours each) |
| `/build` | Senior Developer | Implement code task-by-task with TDD and minimal blast radius |
| `/test` | QA Lead | Run unit, integration, and E2E behavioral tests covering edge cases |
| `/simplify` | Staff Engineer | Run the Ponytail 7-rung ladder to strip over-engineering and dead abstractions |
| `/review` | Staff Engineer + Designer | 5-axis quality gate (correctness, architecture, security, performance, design) |
| `/ship` | Release Engineer | Verify clean CI, lint checks, docs, and rollback plan before merging |

## Dynamic Skill Resolution & Unified CLI (`contextos` / `ctx.js`)

ContextOS provides a unified CLI (`contextos` or `npx contextos-agents`) and local engine (`.agents/ctx.js`) to resolve minimal skills on the fly, run health diagnostics, and compile exports for AI assistants.

### Dynamic Skill Resolution (`resolve` & `index`)

To prevent context bloat, ContextOS dynamically resolves the exact 2–4 skills needed for any prompt or file:

```bash
# Resolve skills for a task description (English):
contextos resolve "Build an accessible modal component with React and Tailwind"

# Output:
# [DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer]
# Skills loaded: ponytail-mindset, engineering-workflow, react, ui-ux-pro, web-accessibility

# Multilingual support (Russian):
contextos resolve "создай модальное окно авторизации и напиши юнит-тесты"

# Output:
# [DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer]
# Skills loaded: ponytail-mindset, engineering-workflow, react, ui-ux-pro, security, testing

# Resolve skills based on active files (hybrid AST & config analysis):
contextos resolve --files "app/api/auth/route.ts"

# Generate/update progressive lightweight skills index:
contextos index

# Clean up lingering .swarm-worktrees directories and orphaned swarm/* git branches:
contextos clean-worktrees
```

### Diagnostic Health Check (`contextos doctor`)

Run a comprehensive pre-flight verification across your repository to ensure valid skills, profile alignment, symlinks, git worktree status, and compiler synchronization:

```bash
contextos doctor
# or: npx contextos-agents doctor
```

### Context Savings Analytics (`contextos stats`)

Measure your real token savings. Compares monolithic prompt injection against ContextOS dynamic skill resolution across frontend, backend, security, and full-stack tasks:

```bash
contextos stats
```

### Continuous Auto-Sync Daemon (`contextos watch`)

Watch your source skills in `.agents/core/skills/` and automatically recompile adapter outputs (`.cursorrules`, `.zed/rules.md`, `.github/copilot-instructions.md`, etc.) upon saving:

```bash
contextos watch
# or: npm run watch
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
contextos export all       # Compile for all agents (or: node .agents/ctx.js export all)
contextos export gemini    # Compile for Gemini / Antigravity
contextos export claude    # Compile for Claude Code
contextos export cursor    # Compile for Cursor (.cursor/rules/*.mdc)
contextos export copilot   # Compile for GitHub Copilot
contextos export aider     # Compile for Aider
contextos export zed       # Compile for Zed IDE
```

### Pre-Compiled Artifacts & Git Architecture

ContextOS commits generated adapter configurations (`.cursorrules`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.aider.conf.yml`, `CONVENTIONS.md`, `.zed/rules.md`) directly into Git:

- **Zero-Build Onboarding:** AI assistants (Cursor, Claude Code, GitHub Copilot, Zed, Aider) activate instantly upon repository clone without requiring `npm install` or separate build steps.
- **Git-Native Context:** Assistant engines index project rules using native file matchers and git tree walking without depending on background daemon processes.
- **Automated Sync & Drift Prevention:** CI strictly validates that generated exports match source skills (`node .agents/ctx.js validate`). Any uncommitted adapter drift fails CI checks via `git diff --exit-code`.
- **Contributor Workflow:** Source rules are authored exclusively in `.agents/core/skills/<name>/SKILL.md`. Running `node .agents/ctx.js export all` regenerates all assistant configurations deterministically.

### CI Quality Gate Action (`contextos-gate`)

You can guard your repository against skill drift, secret leaks, and rule regressions using the official reusable GitHub Composite Action:

```yaml
# .github/workflows/pr-gate.yml
name: ContextOS Quality Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: kok-o/contextos-agents/.github/actions/contextos-gate@main
        with:
          node-version: '20'
```

The action validates skill frontmatter integrity, checks for adapter configuration drift, scans for accidental secrets or API keys, and runs your test suite.

### Plugin Skills & Validation

You can expand your `.agents` folder with community plugins or validate your own custom skills using the top-level commands:

```bash
# Launch the interactive skill installer to browse and install community skills
contextos install-skill
# or: npx contextos-agents install-skill

# Or install a specific skill from a GitHub repository automatically
contextos install-skill --from-repo kok-o/awesome-skill

# Validate your local skills (checks frontmatter, dependencies, and sync)
contextos audit
```

## ContextOS MCP Server & Autonomous Multi-Agent Swarm

ContextOS includes a standalone **Model Context Protocol (MCP)** execution server located in `contextos-mcp/` and bundled as `.agents/mcp/server.mjs`. It allows orchestrator agents (like Antigravity, Claude Code, or Cursor) to safely delegate coding tasks to parallel subagents running in isolated Git worktrees.

> [!TIP]
> **Lightweight by default:** Standard installation (`npx contextos-agents`) installs only lightweight skills, adapters, and behavioral rules (~400 KB) without copying the bundled MCP runtime. To enable MCP worktrees and subagents, pass `--with-mcp` during installation, or run `npx contextos-agents setup-mcp` at any time.

### Installing & Enabling MCP

To add the MCP execution server to an existing `.agents/` project:

```bash
npx contextos-agents setup-mcp
```

Or install a new project with MCP enabled from the start:

```bash
npx contextos-agents --with-mcp
```

> [!IMPORTANT]
> **Git requirement for subagents:** ContextOS MCP delegates tasks using isolated Git worktrees (`git worktree add -b swarm/<id> <path> HEAD`). If initializing in a brand-new empty directory, ensure Git is initialized with at least one commit before dispatching subagents:
>
> ```bash
> git init && git commit --allow-empty -m "Initial commit"
> ```


### MCP Server Configuration

Add ContextOS to your IDE's MCP settings (e.g. in `.agents/mcp_config.json`):

```json
{
  "mcpServers": {
    "contextos": {
      "command": "node",
      "args": [
        "./.agents/mcp/server.mjs",
        "--dir",
        "."
      ]
    }
  }
}
```

### Exposed MCP Tools

| Tool | Purpose | Key Parameters |
|---|---|---|
| `contextos_delegate` | Spawns multiple AI agents in parallel in isolated git worktrees with automatic ContextOS skill injection | `task`, `agents` (model, provider, backend), `wait` (sync/async), `verify_command` (in-worktree test) |
| `contextos_status` | Inspects thread progress, statuses, and diff summaries from memory and persistent disk journal | `dir`, `task_id`, `thread_id` |
| `contextos_diff` | Captures unified git diff and changes for a specific thread | `thread_id`, `dir` |
| `contextos_compare` | Compares multi-agent solutions side-by-side with token cost and execution duration metrics | `thread_ids`, `dir` |
| `contextos_merge` | Merges completed thread branches back into the main working tree with conflict detection | `thread_id`, `dir`, `delete_branch` |
| `contextos_cleanup` | Destroys worktrees, frees sessions, and purges orphaned branches and leftover directories | `dir`, `purge_orphans` |

### Enterprise Architecture Guarantees

- **Git Worktree Sandboxing:** Each subagent operates in a private git worktree (`.swarm-worktrees/`). The developer's active workspace cannot be corrupted by experimental changes or failing tests.
- **Disk-Backed Session Persistence:** Active and completed threads are recorded in `.swarm-worktrees/session-state.json`. If the MCP process is restarted, tasks and diffs can be recovered without losing work.
- **Automated In-Worktree Verification (`verify_command`):** Runs test commands (`npm test`, `cargo test`, `pytest`) inside the isolated worktree before marking tasks as successful.
- **Context Token Compression:** The server extracts essential rules, constraints, and checklists (`extractEssentialSkillContent`), eliminating verbose samples and reducing prompt overhead.

## Testing

Tests use the **Node.js built-in test runner** for the core framework and **Vitest** for the MCP engine — zero external test bloat.

### 1. Root Test Suite (131 tests)

```bash
npm test
```

```text
# tests 131
# suites 27
# pass  131
# fail  0
```

### 2. MCP Server Test Suite (440 tests)

```bash
cd contextos-mcp && npm test
```

```text
Test Files  25 passed | 1 skipped (26)
     Tests  440 passed | 13 skipped (453)
```

**Test coverage:**

- `tests/install.test.js` — installer CLI flags (--help, --minimal, --dry-run, --force)
- `tests/export.test.js` — ctx.js export for gemini, claude, cursor (.mdc rules), copilot, aider, zed
- `tests/skills.test.js` — validates all skill source files and frontmatter
- `tests/profile.test.js` — profile resolution, stack auto-detection, and skill filtering
- `tests/validate.test.js` — validator rules, dependency graph, and sync checks
- `tests/plugins.test.js` — plugin lockfile, registry fetching, and security checks
- `tests/resolver.test.js` — dynamic skill resolution, AST import graph analysis, progressive index, and bilingual prompt matching
- `tests/benchmark.test.js` — benchmark scoring engine, static AST checks, runtime sandbox, and reporters
- `contextos-mcp/tests/unit/session-persistence.test.ts` — session disk persistence, thread state tracking, and orphan purge
- `contextos-mcp/tests/unit/contextos-tools.test.ts` — all 6 MCP tool handlers and validation

## Benchmark: With Skills vs. Without Skills

The repository includes a paired, reproducible code-quality benchmark suite supporting OpenAI (GPT-4o, GPT-5, o1, o3-mini), Google Gemini, Anthropic Claude, and custom gateways (AgentRouter, OpenRouter).

The benchmark evaluates real-world code quality, security vulnerabilities, timing attacks, ARIA accessibility contracts, DDD business invariants, and error isolation between baseline LLMs and ContextOS-assisted agents.

### Live Benchmark Execution

```bash
# 1. Run live benchmark with OpenAI (GPT-4o, GPT-5, o3-mini):
set OPENAI_API_KEY=sk-...    # PowerShell: $env:OPENAI_API_KEY = "sk-..."
npm run benchmark:live -- --provider openai --model gpt-4o

# 2. Run live benchmark with Google Gemini:
set GEMINI_API_KEY=...       # PowerShell: $env:GEMINI_API_KEY = "..."
npm run benchmark:live -- --provider gemini --model gemini-2.5-flash

# 3. Run live benchmark with Anthropic Claude:
set ANTHROPIC_API_KEY=...    # PowerShell: $env:ANTHROPIC_API_KEY = "..."
npm run benchmark:live -- --provider anthropic --model claude-3-7-sonnet-20250219

# 4. Run with custom OpenAI-compatible router (OpenRouter, AgentRouter, Local vLLM):
node benchmarks/run-live-benchmark.js --base-url "https://agentrouter.org/v1" --api-key "sk-..." --model "gpt-5.6-sol" --open
```

### Execution-Backed Runtime Benchmark (Real Sandbox Test Assertions)

In addition to static checks, ContextOS features an **execution-backed runtime benchmark suite**. It compiles model-generated code in an isolated Node.js V8 sandbox (`node:vm`) and runs rigorous behavioral unit assertions (`node:assert`):

```bash
# 1. Run runtime benchmark with OpenRouter (Google Gemini 3.8 Flash):
node benchmarks/run-runtime-benchmark.js --base-url "https://openrouter.ai/api/v1" --api-key "sk-or-v1-..." --model "google/gemini-3.8-flash" --open

# 2. Run runtime benchmark with AgentRouter (GPT-5.6-sol):
node benchmarks/run-runtime-benchmark.js --base-url "https://agentrouter.org/v1" --api-key "sk-..." --model "gpt-5.6-sol" --open

# 3. Run specific scenario (auth-security, ddd-order-invariants, or resilient-api-client):
npm run benchmark:runtime -- --base-url "https://agentrouter.org/v1" --api-key "sk-..." --model "gpt-5.6-sol" --task auth-security
```

### Evaluation Methodology

Submissions are evaluated using a strict, multi-stage verification pipeline:

1. **Sandboxed V8 Runtime Execution (Primary Ground Truth):** Compiles TypeScript into CommonJS via native AST type stripping (`node:module.stripTypeScriptTypes`) and executes in an isolated sandbox with timeout and assertion checks (`node:assert`).
2. **Behavioral Invariant Testing:** Stress-tests timing attacks (`crypto.timingSafeEqual`), brute-force IP/Account rate-limiting, error stack redaction, immutable Value Objects, domain event dispatch, and circuit breaker state transitions.
3. **Deterministic Static Analysis:** AST verification checking for zero ORM/HTTP transport leakage in domain layers and contract compliance.

### Production Scenarios Evaluated

The runtime sandbox evaluates model outputs against real-world engineering invariants:

| Scenario | Category | Skills Activated | Key Technical Invariant Proved |
|---|---|---|---|
| **Secure Auth & Rate Limiting** | Security & Backend | `security`, `node`, `ponytail-mindset` | Constant-time password verification (`timingSafeEqual`), dual-key rate-limiting, strict email/credential sanitization, zero stack-trace leak in 500s. |
| **DDD Order Aggregate Root** | Architecture & DDD | `ddd`, `system-design`, `decisions` | Immutable `Money` Value Object, state-machine invariants (PENDING → PAID → SHIPPED), explicit Domain Event classes with queue draining. |
| **Resilient API Client** | Reliability & Async | `typescript`, `system-design`, `performance` | 3-state Circuit Breaker (CLOSED → OPEN → HALF-OPEN), `AbortController` timeouts, typed error taxonomy without credential leakage. |

### Running Benchmarks Locally & in CI

You can run the benchmark suite locally with your own API keys:

```bash
# Run runtime sandbox benchmark with Google Gemini:
$env:GEMINI_API_KEY = "your-key"
npm run benchmark:runtime -- --provider gemini --model gemini-2.5-flash

# Run with OpenAI:
$env:OPENAI_API_KEY = "sk-..."
npm run benchmark:runtime -- --provider openai --model gpt-4o

# Run complete multi-model runtime matrix (Gemini, OpenRouter, AgentRouter):
GEMINI_API_KEY=... OPENROUTER_API_KEY=... AGENTROUTER_API_KEY=... node benchmarks/run-multi-runtime.cjs
```

When executed, reports are generated in `benchmarks/results/` (`.html`, `.md`, `.json`) and tracked so results are visible and shareable.

> [!NOTE]
> **Why Runtime Benchmarks Are Dispatch-Only in CI:** Standard CI checks (`validate-skills.yml`) run hermetically without external API calls to avoid flaky network dependencies and API token expenditures on every pull request. Live runtime evaluation is triggered on demand via GitHub Actions **Workflow Dispatch** ([`benchmark-runtime.yml`](.github/workflows/benchmark-runtime.yml)) using secure repository secrets.


## Security — Third-Party Skills

ContextOS skills are **executable context** — they become part of the system prompt that controls your AI agent's behavior. A malicious skill could instruct the AI agent to exfiltrate environment variables, modify files, or ignore your project's security policies.

> [!CAUTION]
> **Install skills only from repositories you trust as you would trust executable code.** Skills installed via `ctx.js skill add` from npm or GitHub are not sandboxed. ContextOS includes a built-in prompt injection scanner, but it cannot guarantee safety of arbitrary third-party content.

## Contributing

We are open to pull requests! See [CONTRIBUTING.md](./CONTRIBUTING.md) for a step-by-step guide on how to add a new skill.

Quick start:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingSkill`)
3. Add your skill in `.agents/core/skills/<name>/SKILL.md`
4. Run `npm test` — all tests must pass
5. Commit your changes (`git commit -m 'feat: add AmazingSkill'`)
6. Push and open a Pull Request

## License

Distributed under the MIT License. You can freely use, modify, and distribute this code.
