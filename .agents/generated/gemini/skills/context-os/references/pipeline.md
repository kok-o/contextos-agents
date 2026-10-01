# Development Pipeline

## The ContextOS Lifecycle

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  DEFINE  │ ──▶ │   PLAN   │ ──▶ │  BUILD   │ ──▶ │  VERIFY  │ ──▶ │  REVIEW  │ ──▶ │   SHIP   │
  │          │     │          │     │          │     │          │     │          │     │          │
  │ What to  │     │ How to   │     │ Write    │     │ Test &   │     │ Quality  │     │ Deploy & │
  │ build    │     │ build it │     │ code     │     │ validate │     │ gates    │     │ document │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
       │                │                │                │                │                │
  PRD.md           ARCHITECTURE.md  source code      tests           code review      DECISION.md
  UI.md            DATABASE.md      components       coverage        self-review      changelog
  ROADMAP.md       API.md           API routes       edge cases      security scan    deploy
  PROJECT_GRAPH    TASKS.md         migrations       performance     a11y audit       release notes
```

## Stage Details

### 1. DEFINE — "What are we building?"

**Input:** User idea or feature request
**Output:** PRD.md, UI.md, ROADMAP.md, PROJECT_GRAPH.md

Process:

1. Intent Analysis — parse the user's request
2. Clarifying questions — fill gaps
3. Generate PRD with clear requirements
4. Generate UI spec if frontend is involved
5. Create initial Project Graph

**Context loaded:** None (this is the starting point)

### 2. PLAN — "How will we build it?"

**Input:** PRD.md
**Output:** ARCHITECTURE.md, DATABASE.md, API.md, TASKS.md

Process:

1. Choose architecture based on profile + requirements
2. Design database schema
3. Define API contracts
4. Break work into atomic tasks
5. Update Project Graph with modules and features

**Context loaded:** PRD.md, profiles/

### 3. BUILD — "Write the code"

**Input:** TASKS.md + relevant architecture docs
**Output:** Source code, migrations, configurations

Process:

1. Pick next task from TASKS.md
2. Context Compiler loads only relevant skills and docs
3. Write code following loaded skill instructions
4. Commit after each completed task
5. Update Project Graph if structure changes

**Context loaded:** Task-specific (via Context Manager)

### 4. VERIFY — "Prove it works"

**Input:** Source code
**Output:** Tests, coverage reports

Process:

1. Write tests for new code
2. Run existing tests — ensure nothing broke
3. Check edge cases
4. Verify performance (if applicable)

**Context loaded:** Testing skills + API.md

### 5. REVIEW — "Quality check"

**Input:** Code changes (diff)
**Output:** Review comments, approved changes

Process:

1. Self-review against coding standards
2. Security scan (if security skill loaded)
3. Accessibility audit (if frontend)
4. Check against ARCHITECTURE.md — does this align?
5. Check against Decision Records — does this contradict anything?

**Context loaded:** ARCHITECTURE.md + relevant skills + decisions/

### 6. SHIP — "Deploy and document"

**Input:** Reviewed, tested code
**Output:** Deployment, decision records, release notes

Process:

1. Record any architectural decisions made (ADR)
2. Update ROADMAP.md — mark completed items
3. Update TASKS.md — close completed tasks
4. Deploy (if deployment skill loaded)
5. Update Project Graph

**Context loaded:** ROADMAP.md, TASKS.md, deployment skills

## Profiles and Pipeline

Different profiles customize the pipeline:

| Profile | Skips | Adds |
| --- | --- | --- |
| **Hackathon** | REVIEW, detailed PLAN | Speed shortcuts |
| **MVP** | Detailed REVIEW, DEPLOY | Quick iterations |
| **Startup** | Heavy docs | Balance of speed and quality |
| **Enterprise** | Nothing | ADR enforcement, security gates, full testing |
