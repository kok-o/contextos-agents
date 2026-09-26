# context-os

## Overview

Deterministic context compiler and policy engine for AI coding agents. Standardizes software engineering workflows across requirements, architecture, atomic task planning, implementation, verification, and release.

## When to Use

Activate as the root meta-orchestrator across all development phases to ensure role consistency, quality gates, and structured execution.

## Rules & Patterns

You are the **Context Compiler**. Your job is NOT to know everything. Your job is to **assemble the minimum context** needed for the current task.

## Pipeline

When a user gives you a task, follow this pipeline:

### Stage 1: Intent Analysis

Analyze the user's prompt and determine:

```yaml
intent:
  project_type: [webapp, api, mobile, cli, library, saas, crm, ecommerce]
  industry: [healthcare, fintech, education, social, general]
  layers:
    frontend: true/false
    backend: true/false
    database: true/false
    auth: true/false
    ai: true/false
    payments: true/false
    realtime: true/false
  scope: [new_project, feature, bugfix, refactor, architecture]
```

### Stage 2: Dependency Resolution

For each required layer, load the skill graph:

1. Read `skill.yaml` from each relevant skill directory
2. Resolve `requires` - load mandatory dependencies
3. Check `conflicts` - ensure no incompatible skills are loaded
4. Apply `optional` - suggest but don't force
5. Respect project profile (if set) - apply rules from `profiles/`

**Dependency resolution example:**

```
Need: nextjs
  → requires: react, typescript
    → react requires: typescript (already loaded)
  → optional: tailwind, prisma, next-auth
  
Loaded: [nextjs, react, typescript]
Suggested: [tailwind, prisma, next-auth]
```

### Stage 3: Context Compilation

Assemble context from three levels:

**Level 1 - Vision (always available):**

- `docs/PRD.md` - what are we building
- `docs/ROADMAP.md` - where are we going
- `docs/PROJECT_GRAPH.md` - project structure
- `docs/API.md` - API specification (optional, when backend API layer is present)
- `docs/UI.md` - UI/UX specification (optional, when UI layer is present)

**Level 2 - Architecture (load when needed):**

- `docs/ARCHITECTURE.md` - system design and boundaries
- `docs/decisions/` - architecture decision records (ADRs)
- `docs/PRODUCT_BOUNDARIES.md` - maturity boundaries and non-promises
- `references/context-rules.md` - dynamic context selection and compilation rules

**Level 3 - Task-Specific Context (load per task):**

- Relevant skill documents from `.agents/skills/`
- Target code and test files within planned blast radius

### Stage 4: Focused Context Selection

Before sending context to the AI coding assistant:

1. Select only skills relevant to the task domain and touched files
2. Prioritize: task goal > architectural constraints > project conventions
3. Include active Decision Records that affect the target component
4. Enforce quality guardrails and verification criteria

## Core CLI Commands

| Command | Action |
| --- | --- |
| `contextos init` | Initialize `.agents/` folder and bootstrap profiles |
| `contextos export <agent>` | Compile skills for target agent (`gemini`, `claude`, `cursor`, `copilot`, `aider`, `zed`, `all`) |
| `contextos resolve "<task>"` | Dynamically resolve relevant skills, rules, and risk level for task |
| `contextos validate` | Validate skill schemas, dependencies, and detect configuration drift |
| `contextos doctor` | Pre-flight diagnostics for skills, profiles, and compiler synchronization |
| `contextos watch` | Background file watcher for continuous auto-compilation |

## Project Initialization Flow

When user says something like "Сделай CRM для стоматологии" or "Build a Trello clone":

1. **Analyze intent** (Stage 1)
2. **Ask clarifying questions:**
   - Users and roles?
   - Tech stack preference?
   - Mobile app needed?
   - AI features?
   - Authentication type?
   - Expected load?
   - MVP or Production?
3. **Select profile** (startup/enterprise/mvp/hackathon)
4. **Resolve skills** (Stage 2)
5. **Generate all documents** using `generators/` skill
6. **Create Project Graph** - the master map of modules -> features -> tasks -> files -> skills
7. **Output agent config** using `adapters/` skill

## Skill Discovery

Skills are discovered by scanning `.agents/skills/*/skill.yaml`. Each `skill.yaml` defines:

```yaml
id: react
name: React
category: frontend
tags: [frontend, spa, jsx, components]
requires: [typescript]
optional: [tailwind, next-auth, react-query]
conflicts: [vue, angular, svelte]
weight: 8
documents:
  - react.md
```

The compiler builds a dependency graph from all discovered skills and resolves it for each task.


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


# context-os Examples — Anti-patterns vs ContextOS Standard

## Example 1: Project Lifecycle Management

### Anti-pattern: Ad-hoc Unstructured Development

```text
Coding -> Modifying DB -> Debugging -> Redesigning UI -> Changing Architecture
All in one unstructured stream of consciousness.
```

### Best practice: ContextOS Standard (Phase-Gated Development)

```text
Phase 1: DEFINE (PRD & Requirements)
Phase 2: PLAN (Atomic Tasks & ADRs)
Phase 3: BUILD (TDD & Minimalist Implementation)
Phase 4: VERIFY (Automated Test Proof)
Phase 5: REVIEW (Design QA & Code Review)
Phase 6: SHIP (Production Release)
```

# context-os Troubleshooting & Common Mistakes

## 1. Stale Compiled Artifacts

- **Symptom**: Editor rules don't reflect newly updated skills.
- **Root Cause**: Modifying .agents/core/skills/ without recompiling exports.
- **Fix**: Run node .agents/ctx.js export all whenever source skills are updated.