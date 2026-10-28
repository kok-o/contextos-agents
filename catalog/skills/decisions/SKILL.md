---
name: decisions
description: Record or update significant engineering decisions with context,
  alternatives, consequences and evidence.
---

# decisions

## Overview

Record or update significant engineering decisions with context, alternatives, consequences and evidence. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A consequential choice needs a durable rationale, or an existing decision must be reconciled with new evidence. Small routine edits need no ADR ceremony.

## Rules & Patterns

Inspect existing decisions and their ownership. Record the problem, constraints, considered options, chosen outcome and consequences at the depth needed for future readers.

Separate a proposed decision from one actually accepted or implemented. Cite observed constraints and measurements; do not invent agreement, performance results, cost savings or zero-risk outcomes.

Preserve historical records. When circumstances change, explain whether a decision is amended or superseded rather than silently rewriting its original rationale.

Use the repository's naming and format. An ADR documents a choice; it does not authorize deploying it or creating a new architecture outside the task.

## Code Examples

A shared session store decision can compare the current deployment, consistency and failure requirements. Record added operational cost and invalidation concerns instead of promising zero session loss or unmeasured latency.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Check links, status and consistency with the actual implementation.
- [ ] Mark open assumptions, ownership and any required future measurement.

## Common Mistakes

Writing an ADR for every edit; inventing stakeholder approval; replacing a historical decision without a supersession trail.

## Integration Notes

Optional companion guidance: system-design, engineering-workflow. Use it only when relevant and available; the skill does not install tools or authorize external actions.
