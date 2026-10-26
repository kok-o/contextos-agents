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

This guide targets the **3.0.0-rc.1** core candidate on npm's `next` tag. Follow the
[RC instructions](docs/RELEASE_3.0.0-rc.1.md) to install a pinned development dependency,
then use `npx --no-install contextos`. The compiler runs from the installed package;
the project holds rules only, so there is no `.agents/ctx.js` to run.

### Initialization options

The [README quickstart](README.md#quickstart) initializes the rule folder first
and exports after you add a team rule.

```sh
npx --no-install contextos init                    # .agents/project/skills + .gitignore block, nothing else
npx --no-install contextos init --dry-run          # Preview, writes nothing
npx --no-install contextos init --with-core        # Also the seven bundled core skills and AGENTS.md (alias: --minimal)
npx --no-install contextos init --preset frontend  # Frontend catalog skills
npx --no-install contextos init --preset backend   # Backend catalog skills
npx --no-install contextos init --preset devops    # DevOps catalog skills
npx --no-install contextos init --all              # Bundled core plus every catalog skill
npx --no-install contextos init --profile startup  # Also install and apply a profile
npx --no-install contextos init --with-core --agent cursor   # Export for one client right away
npx --no-install contextos --help
npx --no-install contextos --version
```

Each `init` line is an alternative for a new project. A project with no rules has
nothing to export, so `--agent` exports only when rules exist (for example with
`--with-core`). `init` refuses to run in an initialized project; `--force`
refreshes the bundled files (core skills, `AGENTS.md`, profile definitions) and
deletes nothing, so your rules under `.agents/project/` are always safe.

For a reproducible project setup:

```sh
npm install --save-dev --save-exact /path/to/contextos-agents-3.0.0-rc.1.tgz
npx --no-install contextos init
npx --no-install contextos compile
npx --no-install contextos export all
```

Commit the dependency lockfile. Use `npm.cmd` and `npx.cmd` in PowerShell if its
execution policy blocks the wrappers. For updates and removal, follow
[onboarding](docs/product/onboarding.md) and the
[migration guide](docs/MIGRATION.md).

### Activation: how a rule reaches an agent

A rule's frontmatter or selected manifest states how it should be delivered:

```yaml
activation: always   # always | auto | globs  (default: auto)
globs: "src/api/**/*.ts,src/routes/**/*.ts"   # required when activation is globs
```

`always` rules are placed where each client loads files at the start of a session
(`.claude/rules/`, `alwaysApply` in Cursor, the body inside Copilot and Aider
files). `globs` rules apply to matching files only. `auto` rules are skills the
agent selects from their description. The per-client mapping is in the
[README](README.md#how-a-rule-reaches-each-agent) and the
[compatibility matrix](docs/ADAPTER_COMPATIBILITY.md). `contextos validate`
reports an unknown value, an empty body, or a `name` that differs from the folder.

Manifests take precedence in this order: `skill.v2.yaml`, `skill.yaml`, then a
manifestless `SKILL.md`. A manifest may declare a different Markdown `entrypoint`
and resources relative to its skill directory. Compiler, validator and adapters
use that same entrypoint. A missing entrypoint or a symlink/junction escape fails
before export changes existing outputs. Exported Markdown links are adjusted
for their destination; declared Markdown resources are copied for native skills.

Manifest `activation` and `globs` override the corresponding entrypoint
frontmatter. `globs` accepts a string or a list of non-empty strings; brace groups
such as `**/*.{ts,tsx}` keep their inner commas. `fileGlobs` is a legacy manifest
alias for adapter scopes. These fields do not replace resolver
`signals.fileGlobs`, which score task recommendations.

### Updating and removing

```sh
contextos update --dry-run     # plan: refresh bundled files, migrate 2.x projects, re-export
contextos update
contextos uninstall            # prints the plan; changes nothing without --yes
contextos uninstall --yes
```

`uninstall` removes generated files that still match what ContextOS wrote, the
managed block in files that also hold your text, lockfiles, caches and the
`.gitignore` block. It keeps `.agents/project/`, anything you edited and anything
it did not write, and refuses to follow a symlink or junction out of the project.
Merged settings files such as `.aider.conf.yml` are kept in full because their
values may belong to you. Remove obsolete `CONVENTIONS.md` references manually
after uninstalling.

### Working in a team

Branches, merges, CRLF checkouts and conflict recovery are covered in the
[team workflow](docs/TEAM_WORKFLOW.md). In short: commit sources, generated files
and the lockfile together; after a merge, resolve source conflicts and run
`contextos export all`.

### Dynamic Skill Resolution (`resolve`)

```bash
# Inspect the skills recommended for a task:
contextos resolve "Build an accessible modal component with React and Tailwind"

# With detailed evidence scoring explanation:
contextos resolve "security review Next.js auth" --files apps/web/app/login/page.tsx --explain

# Limit the answer to skills installed in this project:
contextos resolve "Fix the login handler" --installed-only

# Output structured JSON for scripts and IDE integrations:
contextos resolve "Dockerize NestJS API" --json
```

Your own rules are routed on their name and description. Selection does not install a skill or prove that a client loaded its body.
The text output's `Skills loaded:` label describes a selection declaration.
Missing selected skills can produce `CTX_SELECTED_SKILL_UNAVAILABLE`; install
them with `contextos skill add <name>` before using them. Resolver budgets are
soft estimates of selected bodies and exclude client instructions, chat history,
and tool output. Required safety guidance can overflow the budget with a warning.

With `--installed-only`, a project with no installed skills returns an empty
selection. If conflict resolution rejects a required dependency, its dependent
skill is also omitted; an unsatisfiable explicit request is reported in
`conflicts` with `resolution: "error"`.
Missing required instructions produce `CTX_REQUIRED_SKILL_UNAVAILABLE`. A skill
whose prerequisite is uninstalled under `--installed-only` or excluded by the
profile is omitted with `CTX_RESOLVER_DEPENDENCY_UNAVAILABLE`. These warnings
expose missing guidance; they do not install a replacement.

### Stack Detection & Workspace Graph (`detect`)

```bash
# Auto-detect project tech stack (React, Next.js, FastAPI, Cargo, Go, etc.):
contextos detect

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

Nested overrides use the most specific matching directory: a rule for
`packages/api` takes precedence over `packages`, regardless of application order.

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

# Check without writing (exit 0 pass, 1 drift, 2 error):
contextos export all --check --json

# Replace a differing file at a generated path explicitly:
contextos export all --force

# Compile rules for a specific agent:
contextos export gemini
contextos export claude
contextos export cursor
contextos export zed
```

After changing source skills, run `contextos compile` before exporting (the check
does not depend on it, but `resolve` does). Ordinary exports do not use the last
`resolve` query as a filter. `init` exports only when you ask for it with
`--agent`. Claude Code receives `.claude/rules/` and `.claude/skills/`; your
`CLAUDE.md` is not touched. Zed outputs are manual templates. See the
[adapter matrix](docs/ADAPTER_COMPATIBILITY.md).

### Diagnostics and Monitoring

The public CLI's `--project <path>` targets diagnostics and mutations at that
root, including `status`, `detect`, and `doctor --fix`. A missing path value is
an error. Paths with spaces can be quoted. `export --target cursor,claude` and
`export --check --target cursor,claude` render the same selected adapter set.

```bash
# Run pre-flight health diagnostics (stack, installed skills, MCP, secrets):
contextos doctor

# Estimate the size of the installed rule payload:
contextos stats

# Background daemon for continuous synchronization on file changes:
contextos watch
```

`watch` observes rule sources under `.agents/`, including project and vendor
skills created after it starts, and excludes generated projections and caches.
If another ContextOS command holds the project lock, it retries after a delay.
Fallback directory watchers are replaced when source directories are recreated.
Fallback mode also reconciles source-file metadata every second, so missing or
nameless native notifications do not leave newly created source trees untracked.
Generated files and state are excluded from that scan.

After an interrupted export or update, inspect its journal and choose whether
to finish the transaction or restore its original files:

```bash
contextos recover --list
contextos recover --resume <transaction-id>
# Or restore the state before the interrupted operation:
contextos recover --rollback <transaction-id>
```

Recovery checks file hashes before changing them. If a file was edited after
the interruption, recovery stops with an error and keeps the transaction's
backups for manual reconciliation. Partially completed rollbacks can be retried
with `--rollback`.
If a legacy journal lacks original file preconditions, resume is refused rather
than guessing from the current contents. Preserve the journal and backups for
manual reconciliation or rollback of operations with known original state.

### Validation and Testing

```bash
# Validate integrity of skills, schemas, and dependencies:
contextos validate

# Run the full test suite:
npm test

# Run tests for the optional MCP package:
cd contextos-mcp && npm test
```

### Security Scanning & Governance Hooks

```bash
# Scan staged Git index for secrets, blocked files, and placeholders
# (reports only; add --enforce to fail on findings):
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

The RC package and tag are not published yet. Until then, run the local
`npx --no-install contextos gate --target all`; the example below is for after publication.

```yaml
- uses: kok-o/contextos-agents/.github/actions/contextos-gate@v3.0.0-rc.1
  with:
    version: '3.0.0-rc.1'
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
[the 2.3.2 checklist](docs/archive/PATCH_RELEASE_2.3.2.md).

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

Your rules live in `.agents/project/skills/`. The package also carries seven core skills (copied into `.agents/core/skills/` by `init --with-core`) and `catalog/skills/` (36 on-demand domain skills installable via `contextos skill add <name>`):

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

- **Quickstart & Onboarding:** [docs/product/onboarding.md](docs/product/onboarding.md) - Five-minute guide to installing, configuring, and verifying ContextOS.
- **Adapter Compatibility Matrix:** [docs/ADAPTER_COMPATIBILITY.md](docs/ADAPTER_COMPATIBILITY.md) - Support tiers, file layouts, and test coverage across AI coding tools.
- **Catalog Quality & Code Examples:** [docs/product/catalog-quality.md](docs/product/catalog-quality.md) - Quality tiers and test runner for executable code snippets in `SKILL.md`.
- **Architecture & Boundaries:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PRODUCT_BOUNDARIES.md](docs/PRODUCT_BOUNDARIES.md) - Internal compiler pipeline and stable vs experimental scope boundaries.
- **Team Workflow:** [docs/TEAM_WORKFLOW.md](docs/TEAM_WORKFLOW.md) - What to commit, how merges behave, and how to recover from conflicts.
- **Alternatives:** [docs/ALTERNATIVES.md](docs/ALTERNATIVES.md) - Simpler options and other tools, compared honestly.
- **Security Model:** [docs/SECURITY.md](docs/SECURITY.md) - What is guaranteed, what is not, and how to report a vulnerability.
- **Architecture Decision Records:** [docs/decisions/](docs/decisions) - Key design choices, trade-offs, and governance foundations.
- **Project Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md) - Strategic evolution milestones and upcoming capabilities.
