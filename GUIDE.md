# ContextOS Guide & Cheat Sheet

Practical guide to managing engineering context for AI coding agents: storing project rules, resolving them per task, and compiling for supported editors and agents.

---

## 1. What is ContextOS in Practice?

**ContextOS** is a deterministic context and policy compiler. It stores your project engineering rules in a single version-controlled source, compiles settings for supported agents, and helps detect configuration drift in CI.

Key system principles:

- **Single Source of Truth:** Engineering instructions are version-controlled alongside application code.
- **Task-Focused Context:** The resolver selects only the rules and skills applicable to the current task.
- **Verifiable & Reproducible:** Adapters generate native configurations for agents, while lockfiles and CI detect configuration drift.

---

## 2. CLI Commands (`contextos` / `ctx.js`)

Manage profiles, adapters, diagnostics, and validation via the `contextos` CLI (or directly via `node .agents/ctx.js`). All commands support both execution formats:

### Dynamic Skill Resolution (`resolve`)

```bash
# Dynamically resolve the minimal set of skills for a task:
contextos resolve "Build an accessible modal component with React and Tailwind"

# With detailed evidence scoring explanation:
contextos resolve "security review Next.js auth" --files apps/web/app/login/page.tsx --explain

# Output structured JSON for scripts and IDE integrations:
contextos resolve "Dockerize NestJS API" --json
```

### Stack Detection & Workspace Graph (`detect`)

```bash
# Auto-detect project tech stack (React, Next.js, FastAPI, Cargo, Go, etc.):
contextos detect
# or: node .agents/ctx.js detect

# Target a specific monorepo package with evidence breakdown:
contextos detect --scope apps/web --explain
```

### Profile Management v2 (`profile`)

```bash
# List available profiles and the active profile:
contextos profile list

# Inspect profile structure, required/preferred skills, and policies:
contextos profile explain enterprise
contextos profile explain frontend --json

# Switch project profile (supports monorepos and export suppression):
contextos profile apply minimal                          # For rapid prototypes
contextos profile apply frontend --scope apps/web        # Scope to package
contextos profile apply backend                          # Focus on API and database
contextos profile apply enterprise --no-export           # Suppress immediate adapter rewrite
```

### Skill & Catalog Management (`skill`)

```bash
# List installed skills (and inspect available catalog skills):
contextos skill list
contextos skill list --available

# Install domain skills from the catalog (with automatic typo suggestions):
contextos skill add react
contextos skill add fastapi

# Install all 36 catalog skills at once:
contextos skill add --all

# Fork a built-in skill for local customization:
contextos skill override gemini-precision

# Diff local modifications against upstream core:
contextos skill diff gemini-precision

# Decouple local skill permanently from upstream tracking:
contextos skill eject gemini-precision
```

### Export Settings to Editors (Adapters)

```bash
# Compile rules for all supported IDEs (.cursorrules, Zed, Aider, etc.):
contextos export all
# or: node .agents/ctx.js export all

# Compile rules for a specific agent:
contextos export gemini
contextos export claude
contextos export cursor
contextos export zed
```

### Diagnostics and Monitoring

```bash
# Run pre-flight health diagnostics (stack, installed skills, MCP, secrets):
contextos doctor
# or: node .agents/ctx.js doctor

# View context configuration statistics:
contextos stats
# or: node .agents/ctx.js stats

# Background daemon for continuous synchronization on file changes:
contextos watch
# or: node .agents/ctx.js watch
```

### Validation and Testing

```bash
# Validate integrity of skills, schemas, and dependencies:
contextos validate
# or: node .agents/ctx.js validate

# Run the full test suite:
npm test

# Run tests for the optional MCP package:
cd contextos-mcp && npm test
```

### Security Scanning & Governance Hooks

```bash
# Scan staged Git index for secrets, blocked files, and placeholders:
contextos scan --staged --enforce

# Enforce task write-scope containment:
contextos scan --staged --scope .agents/task-scope.json --json

# Install safe, isolated pre-commit Git hooks:
contextos hook install

# Safely remove ContextOS hook block while preserving user hooks:
contextos hook uninstall

# Execute the 8-point CI quality gate:
contextos gate
```

### MCP Server (Beta, Separate Package)

```bash
npm install --save-dev @contextos/mcp
npx contextos-mcp --dir .
```

The MCP server is distributed separately and remains Beta. Runtime execution, subagents, and sandboxes are experimental features outside the stable core CLI.

---

## 3. Six-Phase Workflow Pipeline

When solving engineering tasks, AI agents follow this structured lifecycle:

| Phase | Slash Command | Agent Role | Responsibility |
|---|---|---|---|
| **1. DEFINE** | `/spec` | `Product Manager` | Analyzes requirements, formulates acceptance criteria, and asks clarifying questions. **Does not write code.** |
| **2. PLAN** | `/plan` | `Architect` | Creates a step-by-step implementation plan, identifies affected files, and assesses risk. **Does not write code.** |
| **3. BUILD** | `/build` | `Senior Developer` | Writes clean, production-ready code without stubs or placeholders (following YAGNI). |
| **4. VERIFY** | `/test` | `QA Lead` | Writes unit and integration tests, verifying edge cases and boundary conditions. |
| **5. REVIEW** | `/review` | `Staff Engineer` / `Senior Designer` | Performs rigorous code review, security audits, and UI checks (`impeccable-design`). |
| **6. SHIP** | `/ship` | `Release Engineer` | Verifies builds, updates documentation, and prepares release changelogs. |

---

## 4. Key Core & Catalog Skills

Skills live in `.agents/core/skills/` (core essential skills) and `catalog/skills/` (36 on-demand domain skills installable via `contextos skill add <name>`):

### Core Skills (7)

- **`engineering-workflow`** - Senior engineering lifecycle enforcing DEFINE -> PLAN -> BUILD -> VERIFY -> REVIEW -> SHIP.
- **`ponytail-mindset`** - Minimalist coding standard (YAGNI): prefer standard library and platform APIs over superfluous npm dependencies, clean solutions.
- **`gemini-precision`** - Strict precision mode for Gemini models: zero assumptions, zero placeholders (`// TODO`), and mandatory proof-of-work verification.
- **`security`** - Security audits: explicit authorization before data access, strict input validation (e.g. Zod), and sanitization.
- **`context-os`** - Deterministic context compiler and policy engine for AI coding agents.
- **`context-manager`** - Smart context selection engine and graph-based relevance resolution.
- **`gstack-roles`** - Role-based AI specialist system declaring specialist roles per task phase.

### Extended Catalog Skills (36)

Installable into any project on demand via `contextos skill add <name>`, `contextos skill add --all`, or stack presets during `init`:

- **Presets at Init (`--preset <name>`):**
  - `frontend`: `react`, `react-best-practices`, `nextjs`, `typescript`, `ui-ux-pro`, `impeccable-design`, `state-management`, `web-accessibility`
  - `backend`: `system-design`, `api-design`, `node`, `fastapi`, `nestjs`, `database`, `ddd`
  - `devops`: `docker`, `ci-cd`, `terraform`, `security-audit`, `performance`
  - `full` or `--all`: Installs all 36 catalog skills
- **Frontend & Design:** `react`, `react-best-practices`, `nextjs`, `typescript`, `ui-ux-pro`, `impeccable-design`, `state-management`, `ui-design`, `ux-design`, `web-accessibility`, `brutalist-design`, `minimalist-design`, `soft-design`, `redesign-audit`.
- **Backend & Systems:** `system-design`, `api-design`, `node`, `fastapi`, `nestjs`, `microservices`, `ddd`, `database`.
- **DevOps & Cloud:** `docker`, `ci-cd`, `terraform`, `security-audit`.
- **Cross-Cutting & Architecture:** `testing`, `performance`, `decisions`, `architecture-diagrams`, `interview-me`, `subagent-orchestrator`, `graphify`, `vercel-optimize`, `adapters`, `generators`.

---

## 5. Ready-to-Use Prompt Templates

Use these templates to quickly launch workflows:

### Scenario 1: Developing a New Feature (Full Lifecycle)

> `[DOMAIN: Full-Stack] [PHASE: Define] [ROLE: Product Manager]`
> `Skills: engineering-workflow, interview-me`
>
> _I want to add Time-based One-Time Password (TOTP) two-factor authentication. Launch the /spec phase. If there is ambiguity, ask me questions before finalizing the specification._

---

### Scenario 2: Transitioning from Plan to Implementation

> `[DOMAIN: Full-Stack] [PHASE: Build] [ROLE: Senior Developer]`
> `Skills: gemini-precision, ponytail-mindset`
>
> _The implementation plan is approved. Transition to /build. Write the complete service implementation without stubs or TODOs. Verify all dependencies in package.json._

---

### Scenario 3: Crafting Modern Premium Interfaces

> `[DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Designer]`
> `Skills: ui-ux-pro, react, typescript`
>
> _Build a profile analytics card component. Use Tailwind CSS with semantic tokens, dark mode support, smooth hover micro-animations, and full a11y compliance. Avoid AI-generated clichés (no pure #000000, no harsh shadows, no excessive border radius)._

---

### Scenario 4: Security Audit and Code Review

> `[DOMAIN: Backend] [PHASE: Review] [ROLE: Chief Security Officer]`
> `Skills: security, engineering-workflow`
>
> _Audit security and code quality for [api/payment.ts](file:///path/to/payment.ts). Verify input validation, authorization checks, and edge-case handling._

---

### Scenario 5: Refactoring and Performance Optimization

> `[DOMAIN: Full-Stack] [PHASE: Plan] [ROLE: Performance Engineer]`
> `Skills: performance, react-best-practices, system-design`
>
> _The user table component renders sluggishly with 1,000+ rows. Draft an optimization plan (virtualization, memoization, pagination) without unnecessary architectural complexity._

---

## 6. Best Practices for Working with Coding Agents

1. **Clickable File Links:** When referring to files, use relative or absolute paths. Agents can navigate files directly via markdown links.
2. **Never Skip Planning:** For tasks involving more than 1-2 lines of code, always require `/spec` and `/plan` first. This saves up to 80% of debugging time.
3. **Mandatory Proof-of-Work:** Require the agent to run `node .agents/ctx.js validate` and automated tests before marking tasks as complete.

---

## 7. Documentation Map

Explore deeper architecture guides, adapter references, and product specifications:

- **Quickstart & Onboarding:** [docs/product/onboarding.md](./docs/product/onboarding.md) - Five-minute guide to installing, configuring, and verifying ContextOS.
- **Adapter Compatibility Matrix:** [docs/ADAPTER_COMPATIBILITY.md](./docs/ADAPTER_COMPATIBILITY.md) - Support tiers, file layouts, and test coverage across 11 AI coding tools.
- **Catalog Quality & Code Examples:** [docs/product/catalog-quality.md](./docs/product/catalog-quality.md) - Quality tiers and test runner for executable code snippets in `SKILL.md`.
- **Pilot Protocol & Evaluation:** [docs/product/pilot-protocol.md](./docs/product/pilot-protocol.md) and [docs/product/pilot-results.md](./docs/product/pilot-results.md) - Team evaluation methodology and verified benchmark results.
- **Architecture & Boundaries:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/PRODUCT_BOUNDARIES.md](./docs/PRODUCT_BOUNDARIES.md) - Internal compiler pipeline and stable vs experimental scope boundaries.
- **Project Roadmap:** [docs/ROADMAP.md](./docs/ROADMAP.md) - Evolution milestones and completed phases.
