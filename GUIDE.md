# ContextOS Guide & Cheat Sheet

Practical guide to managing engineering context for AI coding agents: storing project rules, resolving them per task, and compiling for supported editors and agents.

---

## 1. What is ContextOS in Practice?

**ContextOS** is a deterministic context and policy compiler. It stores your project engineering rules in a single version-controlled source, compiles settings for supported agents, and helps detect configuration drift in CI.

Key system principles:

- **Single Source of Truth:** Engineering instructions are version-controlled alongside application code.
- **Task Selection:** The resolver recommends rules and skills from task and file evidence; the consuming client controls activation.
- **Verifiable & Reproducible:** Adapters generate native configurations for agents, while lockfiles and CI detect configuration drift.

---

## 2. CLI Commands (`contextos` / `ctx.js`)

The examples below use the `contextos` executable. Use `npx contextos-agents`
without a project installation, or install a pinned development dependency and
use `npx --no-install contextos`. Prefer the package executable in ESM projects;
running the copied `.agents/ctx.js` directly can inherit the project's module type.

### Initialization options

The [README quickstart](README.md#quickstart) initializes the sources first and
exports after adding a team rule. `--skip-compile` defers the installer's local
script invocation; subsequent package CLI commands also work in projects with
`"type": "module"`.

```sh
npx contextos-agents init --skip-compile
npx contextos-agents init --dry-run           # Preview installation
npx contextos-agents init --preset frontend  # Frontend catalog skills
npx contextos-agents init --preset backend   # Backend catalog skills
npx contextos-agents init --preset devops    # DevOps catalog skills
npx contextos-agents init --all              # All catalog skills
npx contextos-agents init --profile startup
npx contextos-agents init --auto
npx contextos-agents --help
npx contextos-agents --version
```

Each `init` line is an alternative for a new installation. Add `--skip-compile`
to a preset or profile initialization to defer export, then run `compile` and
`export` through the package CLI. Default initialization installs seven core
skills; `--minimal` makes that choice explicit. `--force` permits overwriting an
existing `.agents` installation and is not needed for the quickstart.

For a reproducible project setup:

```sh
npm install --save-dev --save-exact contextos-agents@2.3.2
npx --no-install contextos init --skip-compile
npx --no-install contextos compile
npx --no-install contextos export gemini
```

Commit the dependency lockfile. Use `npm.cmd` and `npx.cmd` in PowerShell if its
execution policy blocks the wrappers. For updates and removal, follow
[onboarding](docs/product/onboarding.md) and the
[migration guide](docs/COMPACT_CONTEXT_MIGRATION.md).

### Dynamic Skill Resolution (`resolve`)

```bash
# Inspect the skills recommended for a task:
contextos resolve "Build an accessible modal component with React and Tailwind"

# With detailed evidence scoring explanation:
contextos resolve "security review Next.js auth" --files apps/web/app/login/page.tsx --explain

# Output structured JSON for scripts and IDE integrations:
contextos resolve "Dockerize NestJS API" --json
```

Selection does not install a skill or prove that a client loaded its body.
The text output's `Skills loaded:` label describes a selection declaration.
Missing selected skills can produce `CTX_SELECTED_SKILL_UNAVAILABLE`; install
them with `contextos skill add <name>` before using them. Resolver budgets are
soft estimates of selected bodies and exclude client instructions, chat history,
and tool output. Required safety guidance can overflow the budget with a warning.

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
# Export installed skills allowed by the active profile:
contextos export all
# or: node .agents/ctx.js export all

# Compile rules for a specific agent:
contextos export gemini
contextos export claude
contextos export cursor
contextos export zed
```

After changing source skills, run `contextos compile` before exporting. Ordinary
exports do not use the last `resolve` query as a filter. Default initialization
exports the shared Gemini/Codex skills unless `--skip-compile` was supplied.
Cursor's default bootstrap is always applied; individual skills use globs or
agent-requested activation. Claude uses an instruction index, while Zed outputs
are manual templates. See the [adapter matrix](docs/ADAPTER_COMPATIBILITY.md).

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

# Check generated adapter configuration drift:
contextos gate
```

The gate checks configuration drift. Application tests, typechecking, and
security scanning are separate checks; passing the gate does not establish
that a model followed the instructions or wrote correct application code.

### CI configuration check

The [README](README.md#check-rule-changes-in-ci) contains a complete workflow.
Pin both the action and its CLI input to the version your repository uses:

```yaml
- uses: kok-o/contextos-agents/.github/actions/contextos-gate@v2.3.2
  with:
    version: '2.3.2'
    adapters: 'all'
    working-directory: '.'
```

The action runs the package's configuration gate without installing your
application's dependencies or running its scripts. Set `adapters` to match
the exports you committed. Commit source rules, generated files, and
`.agents/lockfile.v2.json` together.

The older `v2.3.0` action tag defaults to CLI 2.2.0; retain an explicit `version`
when using that tag. Updating the action source does not update existing tags.
Maintenance release details and validation records are linked from
[the 2.3.2 checklist](docs/PATCH_RELEASE_2.3.2.md).

### MCP Server (Beta, Separate Package)

```bash
npm install --save-dev contextos-mcp
npx contextos-mcp --dir .
```

The MCP server is distributed separately and remains Beta. It exposes read-only
inspection by default. Runtime execution, subagents, and sandbox integrations
are experimental features outside the stable core CLI. Use `contextos-mcp`;
the former `@contextos/mcp` package is historical. See the
[MCP guide](contextos-mcp/README.md) for setup and boundaries.

---

## 3. Six-Phase Workflow Pipeline

The following phase names are optional prompt vocabulary for substantial work.
They are not ContextOS CLI commands or proof of enforced agent behavior. Use
planning and verification proportionate to the task; routine changes do not
require a separate approval cycle or role declaration.

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

- **`engineering-workflow`** - Scope, implementation, verification, and review guidance proportionate to the change.
- **`ponytail-mindset`** - Minimalist coding standard (YAGNI): prefer standard library and platform APIs over superfluous npm dependencies, clean solutions.
- **`gemini-precision`** - Guidance for inspecting code, preserving scope, and reporting relevant verification evidence when using Gemini.
- **`security`** - Guidance for authentication, authorization, protected data, untrusted input, external integrations, and tool execution.
- **`context-os`** - Deterministic context compiler and policy engine for AI coding agents.
- **`context-manager`** - Compatibility alias for `context-os` selection and budgeting guidance.
- **`gstack-roles`** - Compatibility alias for `engineering-workflow`, with optional specialist review perspectives.

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
2. **Use Proportional Planning:** Establish scope and acceptance criteria for substantial or ambiguous work. Routine edits can proceed directly, and existing implementation authorization carries forward.
3. **Relevant Verification:** Run checks appropriate to the change. Use `contextos validate` for skill integrity, export checks for configuration consistency, and application tests for behavior. Report what was actually verified.

---

## 7. Documentation Map

Explore deeper architecture guides, adapter references, and product specifications:

- **Quickstart & Onboarding:** [docs/product/onboarding.md](./docs/product/onboarding.md) - Five-minute guide to installing, configuring, and verifying ContextOS.
- **Adapter Compatibility Matrix:** [docs/ADAPTER_COMPATIBILITY.md](./docs/ADAPTER_COMPATIBILITY.md) - Support tiers, file layouts, and test coverage across AI coding tools.
- **Catalog Quality & Code Examples:** [docs/product/catalog-quality.md](./docs/product/catalog-quality.md) - Quality tiers and test runner for executable code snippets in `SKILL.md`.
- **Architecture & Boundaries:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/PRODUCT_BOUNDARIES.md](./docs/PRODUCT_BOUNDARIES.md) - Internal compiler pipeline and stable vs experimental scope boundaries.
- **Security Policy:** [docs/SECURITY.md](./docs/SECURITY.md) - Vulnerability reporting and security assurance standards.
- **Architecture Decision Records:** [docs/decisions/](./docs/decisions/) - Key design choices, trade-offs, and governance foundations.
- **Project Roadmap:** [docs/ROADMAP.md](./docs/ROADMAP.md) - Strategic evolution milestones and upcoming capabilities.
