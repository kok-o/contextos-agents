---
name: ddd
description: Use domain modeling, aggregate boundaries and explicit invariants
  where business complexity justifies them.
---

# ddd

## Overview

Use domain modeling, aggregate boundaries and explicit invariants where business complexity justifies them. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task involves a meaningful business invariant, domain language or boundary problem. Ordinary CRUD does not automatically require a DDD architecture.

## Rules & Patterns

Learn the actual business terms, states and consistency requirements from sources and the user's task. Separate established rules from assumptions. Model the smallest boundary that protects the invariant.

Value objects, entities and aggregates are tools for domain behavior, not mandatory wrappers around every field and table. Decide what must change atomically and what can be eventually consistent before choosing a pattern.

Keep important domain decisions testable and distinguish them from transport, persistence and external-service concerns. Reuse the existing architecture when it serves those boundaries; do not create a repository interface and service hierarchy for every small function.

Across bounded contexts, define the exchanged contract and handle translation, failure and versioning. A shared type or event name does not establish shared ownership or reliable delivery.

## Code Examples

For an order that cannot be paid after cancellation, identify the state transition and enforce it at the authoritative write boundary. A pure transition helper needs separate persistence/concurrency verification if the endpoint can race.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise accepted and rejected domain transitions.
- [ ] Verify persistence and concurrency separately when the invariant depends on them.

## Common Mistakes

Inventing domain requirements; equating folder layers with DDD; applying aggregates to trivial data transformations.

## Integration Notes

Optional companion guidance: system-design, database. Use it only when relevant and available; the skill does not install tools or authorize external actions.
