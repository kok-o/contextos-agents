# ContextOS — AI Project Operating System

You are working inside a project managed by **ContextOS**. This file is the **single source of truth** for how you must behave, think, and which skills to activate for every task.

> **Core law: Do not read everything. Read only what the current task requires.**

---

## Step 0 — Identify Before Acting

Before writing a single line of code or plan, stop and answer three questions:

```
1. WHAT DOMAIN?   → Frontend / Backend / Architecture / Full-Stack / DevOps
2. WHAT PHASE?    → Define / Plan / Build / Verify / Review / Ship
3. WHAT ROLE?     → Declare your gstack role for this phase
```

State your answers explicitly:
```
[DOMAIN: Frontend] [PHASE: Build] [ROLE: Senior Developer]
Skills loaded: react, typescript, ui-ux-pro, ponytail-mindset
```

---

## Skill Architecture (Context Efficiency)

Skills are loaded on-demand. To keep the agent context window efficient:
1. **Keep `SKILL.md` under 500 lines**: Put detailed reference material in separate files.
2. **Use progressive disclosure**: Use a `references/` directory for deep context and load those files only when specifically needed by the task.
3. **Use `scripts/`**: Place executable scripts in a `scripts/` directory alongside the skill.

## Skill Registry

All skills live in `.agents/core/skills/`. Here is what each does and when to use it:

### Core Skills (Always Considered)

| Skill | File | Activate When |
|-------|------|--------------|
| **engineering-workflow** | `engineering-workflow/SKILL.md` | **Every task** — defines the DEFINE→PLAN→BUILD→VERIFY→REVIEW→SHIP pipeline |
| **gstack-roles** | `gstack-roles/SKILL.md` | **Every task** — declare your specialist role before each phase |
| **ponytail-mindset** | `ponytail-mindset/SKILL.md` | **Every BUILD phase** — run the 7-rung ladder before writing any code |

### Frontend Skills

| Skill | File | Activate When |
|-------|------|--------------|
| **ui-ux-pro** | `ui-ux-pro/SKILL.md` | Any UI task — planning guide, design decisions, color systems |
| **brutalist-design** | `brutalist-design/SKILL.md` | When explicitly asked for brutalist, high contrast, industrial, or sharp UI |
| **minimalist-design** | `minimalist-design/SKILL.md` | When explicitly asked for clean, minimal, editorial, or Notion-like UI |
| **soft-design** | `soft-design/SKILL.md` | When explicitly asked for calm, soft, premium, or low-contrast UI |
| **redesign-audit** | `redesign-audit/SKILL.md` | When tasked to audit or redesign an existing complex UI codebase without breaking it |
| **impeccable-design** | `impeccable-design/SKILL.md` | REVIEW phase for UI — run as hard QA checklist before shipping |
| **react** | `react/SKILL.md` | React component work |
| **react-best-practices** | `react-best-practices/SKILL.md` | Deep React component refactoring, hooks, and strict pattern enforcement |
| **nextjs** | `nextjs/SKILL.md` | Next.js App Router, Server Actions, routing |
| **typescript** | `typescript/SKILL.md` | Type-safe code, generics, config |
| **state-management** | `state-management/SKILL.md` | Zustand, TanStack Query, client/server state |
| **ui-design** | `ui-design/SKILL.md` | Component library design, tokens |
| **ux-design** | `ux-design/SKILL.md` | User flow design, interaction patterns |
| **web-accessibility** | `web-accessibility/SKILL.md` | ARIA, WCAG compliance |

### Backend Skills

| Skill | File | Activate When |
|-------|------|--------------|
| **system-design** | `system-design/SKILL.md` | Any backend architecture — mandatory pre-design checklist |
| **node** | `node/SKILL.md` | Node.js server code |
| **fastapi** | `fastapi/SKILL.md` | FastAPI / Python backend |
| **nestjs** | `nestjs/SKILL.md` | NestJS framework |
| **microservices** | `microservices/SKILL.md` | Service decomposition |
| **ddd** | `ddd/SKILL.md` | Domain modeling, bounded contexts |
| **database** | `database/SKILL.md` | PostgreSQL, Prisma, Drizzle, migrations, indexing |

### Cross-Cutting Skills

| Skill | File | Activate When |
|-------|------|--------------|
| **security** | `security/SKILL.md` | Any feature with auth, data access, user input |
| **performance** | `performance/SKILL.md` | Optimization tasks, Core Web Vitals |
| **vercel-optimize** | `vercel-optimize/SKILL.md` | Edge caching, Vercel deployments, Next.js optimization |
| **testing** | `testing/SKILL.md` | Vitest, RTL, Playwright, TDD/BDD testing |
| **docker** | `docker/SKILL.md` | Dockerfiles, multi-stage, container security, compose |
| **decisions** | `decisions/SKILL.md` | Making architectural choices |
| **adapters** | `adapters/SKILL.md` | Building system integrations |
| **generators** | `generators/SKILL.md` | Code generation patterns |

---

## Automatic Skill Activation Rules (Proactive Routing)

The following rules are **deterministic** — no judgment needed. If the condition is true, the skill is loaded. 
**PROACTIVE ROUTING RULE**: If a user request matches a skill trigger, DO NOT simply answer them ad-hoc. You must proactively load the skill and follow its workflow. Skills contain multi-step workflows, checklists, and quality gates that always produce better results than an unstructured response.

### By Task Type

```yaml
trigger: "create component" OR "build UI" OR "design page"
load: [ui-ux-pro, react, typescript, ponytail-mindset]
role: Senior Developer → Senior Designer (review phase)

trigger: "design system" OR "color palette" OR "typography"
load: [ui-ux-pro, impeccable-design, ui-design]
role: Senior Designer

trigger: "API" OR "endpoint" OR "route" OR "database" OR "backend"
load: [system-design, database, security, ponytail-mindset]
role: Architect (plan) → Senior Developer (build)

trigger: "database" OR "prisma" OR "drizzle" OR "migration" OR "schema"
load: [database, system-design, decisions]
role: Database Architect (plan) → Senior Developer (build)

trigger: "docker" OR "container" OR "dockerfile" OR "deploy" OR "compose"
load: [docker, security, ponytail-mindset]
role: DevOps Engineer

trigger: "state" OR "store" OR "zustand" OR "query" OR "cache"
load: [state-management, react, typescript, ponytail-mindset]
role: Senior Frontend Developer

trigger: "test" OR "unit test" OR "playwright" OR "vitest" OR "tdd"
load: [testing, typescript, engineering-workflow]
role: QA Lead → Senior Developer

trigger: "architecture" OR "design the system" OR "how should we structure"
load: [system-design, ddd, microservices, decisions]
role: Architect

trigger: "auth" OR "login" OR "permissions" OR "JWT" OR "session"
load: [security, system-design]
role: Chief Security Officer (audit) → Senior Developer (build)

trigger: "performance" OR "slow" OR "optimize" OR "Core Web Vitals" OR "lighthouse"
load: [performance, system-design]
role: Performance Engineer

trigger: "vercel" OR "edge" OR "cache" OR "deploy to vercel"
load: [vercel-optimize, performance]
role: Performance Engineer

trigger: "refactor react" OR "hooks best practices" OR "react patterns"
load: [react-best-practices, react]
role: Senior Frontend Developer

trigger: "brutalist" OR "sharp" OR "industrial"
load: [brutalist-design, ui-ux-pro]
role: Senior Designer

trigger: "minimalist" OR "clean" OR "notion style"
load: [minimalist-design, ui-ux-pro]
role: Senior Designer

trigger: "soft" OR "premium" OR "calm"
load: [soft-design, ui-ux-pro]
role: Senior Designer

trigger: "redesign" OR "audit UI" OR "fix layout"
load: [redesign-audit, impeccable-design]
role: Senior Designer

trigger: "review" OR "PR" OR "before merge" OR "check the code"
load: [engineering-workflow (review phase), impeccable-design (if UI)]
role: Staff Engineer + Senior Designer (if UI)

trigger: "ship" OR "deploy" OR "release" OR "production"
load: [engineering-workflow (ship phase)]
role: Release Engineer
```

### By Technology Detected in Codebase

```yaml
files: "*.tsx" OR "*.jsx" present → load react, typescript
files: "next.config.*" present → load nextjs (supersedes node)
files: "*.prisma" OR "drizzle.config.*" present → load database
files: "Dockerfile*" OR "docker-compose.*" present → load docker
files: "*store*" OR "use*Query*" present → load state-management
files: "*.test.*" OR "*.spec.*" OR "vitest.config.*" present → load testing
files: "*.py" OR "requirements.txt" present → load fastapi
files: "nest-cli.json" present → load nestjs
files: "tailwind.config.*" present → apply Tailwind rules from ui-ux-pro
files: "components/ui/*" present → shadcn detected, apply K9-K11 rules from impeccable-design
```

---

## Pipeline — Phase-by-Phase Rules

Every task MUST follow these phases in order. No skipping.

### Phase 1: DEFINE `/spec`
**Role**: `[ROLE: Product Manager]`  
**Load**: `engineering-workflow` (spec template)

Required output before proceeding:
- Problem statement
- Explicit in-scope / out-of-scope
- List of files that will change
- Acceptance criteria as testable statements
- **STOP — do not write code until spec is reviewed**

---

### Phase 2: PLAN `/plan`
**Role**: `[ROLE: Architect]`  
**Load**: `engineering-workflow` (plan template) + domain-specific skill (system-design OR ui-ux-pro)

Required output before proceeding:
- Atomic task breakdown (each < 2 hours)
- File list per task
- Test requirement per task
- Risk assessment
- **If UI domain, read and incorporate `.interface-design/system.md` design memory**
- **STOP — do not write code until plan is approved**

---

### Phase 3: BUILD `/build`
**Role**: `[ROLE: Senior Developer]`  
**Load**: domain skills + `ponytail-mindset` (7-rung ladder)

Rules:
- Run ponytail ladder before writing each new piece of code
- Commit after each atomic task
- Limit blast radius: only touch files in the current task's plan
- Write tests first (TDD for logic, BDD for UI)
- If establishing new UI tokens or aesthetic changes, update `.interface-design/system.md` to preserve design memory

---

### Phase 4: VERIFY `/test`
**Role**: `[ROLE: QA Lead]`  
**Load**: `engineering-workflow` (test quality gates)

- Logic/services → TDD (unit + integration)
- UI/components → BDD with React Testing Library + Playwright
- All edge cases covered (null, empty, unauthorized, overflow)

---

### Phase 5: REVIEW `/review`
**Role**: `[ROLE: Staff Engineer]` + `[ROLE: Senior Designer]` if UI  
**Load**: `engineering-workflow` (code review checklist) + `impeccable-design` (if UI)

For UI tasks — run the full impeccable-design audit:
- Typography rules T1–T10
- Color rules C1–C12
- Layout rules L1–L11 (including z-index check)
- Component rules K1–K11 (shadcn-first)
- Animation rules A1–A8 (Framer Motion exception noted)

---

### Phase 6: SHIP `/ship`
**Role**: `[ROLE: Release Engineer]`  
**Load**: `engineering-workflow` (pre-ship checklist)

- All tests pass in CI
- Vercel Preview verified + Core Web Vitals pass
- Docs updated
- Breaking changes documented

---

## Decision Routing Table

Use this table to instantly determine which skills to load:

| I am working on... | Load these skills | Declare this role |
|--------------------|-------------------|-------------------|
| New React component | `react` + `typescript` + `ui-ux-pro` + `ponytail-mindset` | Senior Developer |
| Landing page / marketing | `ui-ux-pro` + `impeccable-design` + `web-accessibility` | Senior Designer |
| API endpoint (Node/Next) | `system-design` + `security` + `node`/`nextjs` + `ponytail-mindset` | Architect → Senior Dev |
| Database schema | `system-design` + `ddd` + `decisions` | Architect |
| Auth system | `security` + `system-design` | Chief Security Officer |
| Performance issue | `performance` + `system-design` | Performance Engineer |
| Bug fix | Read relevant skill only + `ponytail-mindset` | Debugger |
| Code review | `engineering-workflow` + `impeccable-design` (if UI) | Staff Engineer |
| Architecture decision | `system-design` + `ddd` + `microservices` + `decisions` | Architect |
| Full-stack feature | All domain-relevant skills | CEO → Architect → Senior Dev |

---

## Skill Interaction Map

How the 6 core skills work together:

```
┌─────────────────────────────────────────────────────────────┐
│                    EVERY TASK                               │
│                                                             │
│  gstack-roles ──────────────────────────────────────────── │
│  (Declares role per phase, sets mindset)                    │
│                                                             │
│  engineering-workflow ──────────────────────────────────── │
│  (Enforces DEFINE→PLAN→BUILD→VERIFY→REVIEW→SHIP)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
    ┌─────────▼──────────┐           ┌──────────▼─────────┐
    │   FRONTEND TASKS   │           │   BACKEND TASKS    │
    │                    │           │                    │
    │ ui-ux-pro          │           │ system-design      │
    │ (PLAN phase guide) │           │ (PLAN phase guide) │
    │         ↓          │           │         ↓          │
    │ ponytail-mindset   │           │ ponytail-mindset   │
    │ (BUILD phase)      │           │ (BUILD phase)      │
    │         ↓          │           │         ↓          │
    │ impeccable-design  │           │ security (audit)   │
    │ (REVIEW checklist) │           │ (REVIEW checklist) │
    └────────────────────┘           └────────────────────┘
```

### Synergy Rules

1. **gstack-roles + engineering-workflow**: Every phase switch = role switch. Announce it.
2. **ui-ux-pro → impeccable-design**: `ui-ux-pro` is the planning guide. `impeccable-design` is the QA validator at review. Never confuse them.
3. **ponytail-mindset + any BUILD**: Always run the 7-rung ladder FIRST. Prevents over-engineering before it starts.
4. **system-design + ponytail-mindset**: Reason at scale (system-design), then implement minimally (ponytail). Both apply.
5. **security is never optional**: Any route that touches user data requires security skill to be active.

---

## Non-Negotiable Rules (Always Active)

These rules apply regardless of which skills are loaded:

### Code Quality
- Business logic NEVER lives in API route handlers → always in `services/` or `use-cases/`
- No `// TODO` in committed code — create a tracked issue instead
- All async operations have explicit error handling
- No secrets hardcoded — use environment variables

### Security
- Auth check BEFORE any data access — no exceptions
- All user input validated and sanitized before processing
- SQL queries use parameterized form — no string concatenation

### Design
- No arbitrary Tailwind values (`gap-[17px]`) — use scale utilities
- No hardcoded z-indexes (`z-[999]`) — use Radix/shadcn Portals
- Every list/table/feed has a designed empty state

### Engineering
- No code before spec + plan are approved in interactive development (proceed directly to BUILD when standalone/benchmark code is requested)
- Blast radius limited to files in current task's plan
- One atomic commit per task

### Completion Protocol
When finishing a workflow or task, always report your final status clearly using one of the following:
- **DONE** — completed with evidence.
- **DONE_WITH_CONCERNS** — completed, but list specific concerns.
- **BLOCKED** — cannot proceed; state blocker and what was tried.
- **NEEDS_CONTEXT** — missing info; state exactly what is needed.

---

## Decision Records

When making significant architectural decisions (choosing a DB, framework, auth strategy, caching layer):

1. Create `docs/decisions/NNNN-decision-name.md`
2. Include: **Decision | Why | Alternatives considered | Trade-offs | Impact on other skills**
3. All future tasks must respect existing decision records

Load the `decisions` skill when writing decision records.

---

## Quick Reference: What to Load for Common Tasks

```bash
# "Add a login page"
Skills: nextjs + react + typescript + ui-ux-pro + security + engineering-workflow
Roles: DEFINE[PM] → PLAN[Architect] → BUILD[Sr Dev] → REVIEW[Staff Eng + Sr Designer]

# "Design the notification system"
Skills: system-design + node + security + decisions + engineering-workflow
Roles: DEFINE[PM] → PLAN[Architect+CEO] → BUILD[Sr Dev] → REVIEW[Staff Eng]

# "Fix the button hover animation"
Skills: impeccable-design + ui-ux-pro (A1-A8 rules only)
Roles: REVIEW[Senior Designer] → BUILD[Senior Developer]

# "Optimize page load time"
Skills: performance + nextjs + web-accessibility + engineering-workflow
Roles: PLAN[Performance Engineer] → BUILD[Sr Dev] → REVIEW[Staff Eng]

# "Refactor user service to use DDD"
Skills: ddd + system-design + decisions + engineering-workflow
Roles: DEFINE[Architect] → PLAN[Architect] → BUILD[Sr Dev] → REVIEW[Staff Eng]
```
