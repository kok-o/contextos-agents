# <img src="./Frame%202.png" height="40" align="absmiddle" /> koko-contextos-agents

[![npm version](https://img.shields.io/npm/v/koko-contextos-agents.svg)](https://www.npmjs.com/package/koko-contextos-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.7.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#testing)

This is an open-source set of skills and behavioral rules for AI assistants. The package automatically installs an `.agents` folder into your project, teaching your AI assistant software development best practices (UI Design, Architecture, Security, and more).

## Installation

You do not need to clone anything manually. Just open your terminal in the root of your project and run:

```bash
npx koko-contextos-agents
```

The script will automatically detect your project tech stack, create the `.agents` folder, configure skills, and compile them for your AI agent.

### Options

```bash
npx koko-contextos-agents --help          # Show all options
npx koko-contextos-agents --version       # Show version
npx koko-contextos-agents --profile mvp   # Install with specific profile (mvp, startup, enterprise, frontend, backend)
npx koko-contextos-agents --auto          # Auto-detect tech stack and apply recommended profile
npx koko-contextos-agents --dry-run       # Preview what will be installed
npx koko-contextos-agents --force         # Overwrite an existing .agents/ folder
npx koko-contextos-agents --skip-compile  # Skip auto-compilation step
```

## Why Use This? (Benefits)

- **Save Tokens & Context:** ContextOS prevents prompt bloat by generating scoped, modular rules (e.g., `.cursor/rules/*.mdc` with file-pattern matching), compact index templates, and dynamic skill resolution (`node .agents/ctx.js resolve`) so assistants load only the relevant domain rules.
- **Superior Code Quality:** Pre-configured skills guide the AI to follow modern design patterns (DDD, microservices) and professional UI standards (no pure black colors, semantic palettes) rather than generic internet code.
- **Save Time:** Stop writing massive system prompts or arguing with the AI. The assistant instantly knows your architectural decisions and coding standards from the start.

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
node .agents/ctx.js detect

# List available profiles and current active profile
node .agents/ctx.js profile list

# Apply a profile
node .agents/ctx.js profile apply mvp

# Recompile all agent exports for the active profile
node .agents/ctx.js export all
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

## Dynamic Skill Resolution & CLI (`ctx.js`)

The `.agents/ctx.js` file is the **Context Engine** — it resolves minimal skills on the fly and compiles exports for AI assistants.

### Dynamic Skill Resolution (`resolve` & `index`)

To prevent context bloat, ContextOS dynamically resolves the exact 2–4 skills needed for any prompt or file:

```bash
# Resolve skills for a task description (English):
node .agents/ctx.js resolve "Build an accessible modal component with React and Tailwind"

# Output:
# [DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer]
# Skills loaded: ponytail-mindset, engineering-workflow, react, ui-ux-pro, web-accessibility

# Multilingual support (Russian):
node .agents/ctx.js resolve "создай модальное окно авторизации и напиши юнит-тесты"

# Output:
# [DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer]
# Skills loaded: ponytail-mindset, engineering-workflow, react, ui-ux-pro, security, testing

# Resolve skills based on active files:
node .agents/ctx.js resolve --files "app/api/auth/route.ts"

# Generate/update progressive lightweight skills index:
node .agents/ctx.js index

# Clean up lingering .swarm-worktrees directories and orphaned swarm/* git branches:
node .agents/ctx.js clean-worktrees
```

### Supported Agents & Compilation

| Agent | Command | Output Format |
|-------|---------|---------------|
| **Gemini / Antigravity** | `export gemini` | `.agents/generated/gemini/skills/` |
| **Claude Code** | `export claude` | `.agents/generated/claude/skills/` |
| **Cursor IDE** | `export cursor` | `.cursor/rules/*.mdc` (modular globs) + `.cursorrules` |
| **GitHub Copilot** | `export copilot` | `.github/copilot-instructions.md` |
| **Aider** | `export aider` | `.aider.conf.yml` + `CONVENTIONS.md` |
| **Zed IDE** | `export zed` | `.zed/rules.md` + `.zed/prompts/*.md` |

```bash
node .agents/ctx.js export all       # Compile for all agents
node .agents/ctx.js export gemini    # Compile for Gemini / Antigravity
node .agents/ctx.js export claude    # Compile for Claude Code
node .agents/ctx.js export cursor    # Compile for Cursor (.cursor/rules/*.mdc)
node .agents/ctx.js export copilot   # Compile for GitHub Copilot
node .agents/ctx.js export aider     # Compile for Aider
node .agents/ctx.js export zed       # Compile for Zed IDE
```

### Pre-Compiled Artifacts & Git Architecture

ContextOS commits generated adapter configurations (`.cursorrules`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.aider.conf.yml`, `CONVENTIONS.md`, `.zed/rules.md`) directly into Git:

- **Zero-Build Onboarding:** AI assistants (Cursor, Claude Code, GitHub Copilot, Zed, Aider) activate instantly upon repository clone without requiring `npm install` or separate build steps.
- **Git-Native Context:** Assistant engines index project rules using native file matchers and git tree walking without depending on background daemon processes.
- **Automated Sync & Drift Prevention:** CI strictly validates that generated exports match source skills (`node .agents/ctx.js validate`). Any uncommitted adapter drift fails CI checks via `git diff --exit-code`.
- **Contributor Workflow:** Source rules are authored exclusively in `.agents/core/skills/<name>/SKILL.md`. Running `node .agents/ctx.js export all` regenerates all assistant configurations deterministically.

### Plugin Skills & Validation

You can expand your `.agents` folder with community plugins or validate your own custom skills using the top-level commands:

```bash
# Launch the interactive skill installer to browse and install community skills
npx koko-contextos-agents install-skill

# Or install a specific skill from a GitHub repository automatically
npx koko-contextos-agents install-skill --from-repo kok-o/awesome-skill

# Validate your local skills (checks frontmatter, dependencies, and sync)
npx koko-contextos-agents audit
```

## ContextOS MCP Server & Autonomous Multi-Agent Swarm

ContextOS includes a standalone **Model Context Protocol (MCP)** execution server located in `contextos-mcp/` and bundled as `.agents/mcp/server.mjs`. It allows orchestrator agents (like Antigravity, Claude Code, or Cursor) to safely delegate coding tasks to parallel subagents running in isolated Git worktrees.

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

### 1. Root Test Suite (121 tests)

```bash
npm test
```

```text
# tests 121
# suites 27
# pass  121
# fail  0
```

### 2. MCP Server Test Suite (428 tests)

```bash
cd contextos-mcp && npm test
```

```text
Test Files  24 passed (24)
     Tests  428 passed (428)
```

**Test coverage:**

- `tests/install.test.js` — installer CLI flags (--help, --dry-run, --force)
- `tests/export.test.js` — ctx.js export for gemini, claude, cursor (.mdc rules), copilot, aider
- `tests/skills.test.js` — validates all skill source files and frontmatter
- `tests/profile.test.js` — profile resolution, stack auto-detection, and skill filtering
- `tests/validate.test.js` — validator rules, dependency graph, and sync checks
- `tests/plugins.test.js` — plugin lockfile, registry fetching, and security checks
- `tests/resolver.test.js` — dynamic skill resolution, progressive index, and bilingual prompt matching
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

### Running Benchmarks Locally

You can run the benchmark suite locally with your own API keys:

```bash
# Run runtime sandbox benchmark with Google Gemini:
$env:GEMINI_API_KEY = "your-key"
npm run benchmark:runtime -- --provider gemini --model gemini-2.5-flash

# Run with OpenAI:
$env:OPENAI_API_KEY = "sk-..."
npm run benchmark:runtime -- --provider openai --model gpt-4o
```

When executed, reports are generated in `benchmarks/results/` (`.html`, `.md`, `.json`). These run outputs are kept in your local directory (git-ignored) to keep the repository clean.

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
