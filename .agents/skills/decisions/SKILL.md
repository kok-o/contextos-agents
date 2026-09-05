---
name: decisions
description: >
  >
---
# decision-engine

## Overview

Architecture Decision Record (ADR) system following Michael Nygard format. Captures context, options considered, tradeoffs, and consequences to prevent architectural regression and knowledge loss across AI sessions.

## When to Use

Activate when choosing or switching database engines, authentication strategies, state libraries, or significant architectural patterns.

## Rules & Patterns

You manage **Architecture Decision Records** (ADRs).

## Why Decisions Matter

Without ADRs, the AI agent sees:

- "Database: PostgreSQL" — but doesn't know WHY
- "Auth: JWT" — but doesn't know what alternatives were considered
- "Framework: Next.js" — but doesn't know the tradeoffs

With ADRs, the agent understands the reasoning and won't accidentally contradict prior decisions.

## Commands

### Create a Decision

When an architectural choice is made during any pipeline stage:

1. Auto-increment the decision number
2. Use the template from `generators/templates/DECISION.md`
3. Save to `docs/decisions/NNNN-decision-name.md`
4. Update the Project Graph if the decision affects modules

**Naming convention:** `docs/decisions/0001-use-postgresql.md`

### Query Decisions

Before making changes that touch architecture:

1. Check `docs/decisions/` for related decisions
2. If a decision exists, follow it
3. If a decision needs to change, create a new ADR that **supersedes** the old one

### Decision Lifecycle

```
proposed → accepted → [deprecated | superseded]
```

- **proposed**: Under discussion, not yet committed
- **accepted**: The team agreed, this is the standard
- **deprecated**: No longer relevant (project evolved)
- **superseded**: Replaced by a newer decision (link to it)

## Auto-Detection

The Decision Engine should suggest creating an ADR when it detects:

- A new database/ORM is introduced
- A new framework is added
- Authentication strategy changes
- API versioning approach is chosen
- Deployment strategy is decided
- A significant library is added (state management, testing framework, etc.)


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


<!-- Source: EXAMPLES.md -->

# decisions Examples — Anti-patterns vs ContextOS Standard

## Example 1: Documenting Tech Choices

### Anti-pattern: Tribal Knowledge & Undocumented Decisions

```text
"We switched to Redis for session storage last month because Dan said so on Slack."
Three months later, Dan leaves and nobody knows why the config is set up this way.
```

### Best practice: ContextOS Standard (MADR Architecture Decision Record)

```markdown
# ADR 0003: Use Redis for Distributed Session Storage

## Context and Problem Statement
Our application is transitioning from a single server to horizontally auto-scaled instances.
Sticky sessions on load balancer cause uneven distribution and drop sessions on node recycling.

## Considered Options
1. PostgreSQL session table
2. Redis cluster
3. JWT stateless tokens in cookies

## Decision Outcome
Chosen option: "Redis cluster", because:
- Sub-millisecond read/write latency compared to relational DB queries.
- Built-in TTL automatically handles session expiration without cron cleanup.
- Avoids security risks of client-stored JWT revocation.

## Consequences
- Positive: Stateless web tier, zero session drops on deployment.
- Negative: Adds operational dependency on Redis cluster infrastructure.
```

<!-- Source: TROUBLESHOOTING.md -->

# decisions Troubleshooting & Common Mistakes

## 1. Post-Hoc Justifications

- **Symptom**: ADR written weeks after code is merged, omitting all rejected options.
- **Root Cause**: Treating ADRs as paperwork rather than decision-making tools.
- **Fix**: Write the ADR during the PLAN phase _before_ implementing the decision.

## 2. Omitting Trade-offs

- **Symptom**: ADR lists only benefits, claiming the chosen tech has zero downsides.
- **Root Cause**: Confirmation bias.
- **Fix**: Every architecture decision has costs. Explicitly document negative trade-offs and operational overhead.
