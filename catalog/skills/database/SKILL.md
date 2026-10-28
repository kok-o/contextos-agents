---
name: database
description: Design and diagnose database queries, schema changes, transactions,
  indexes and migration safety for the actual database.
---

# database

## Overview

Design and diagnose database queries, schema changes, transactions, indexes and migration safety for the actual database. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A schema, query, migration, data-access path or database incident is in scope. The guidance is not tied to TypeScript or a particular ORM.

## Rules & Patterns

Inspect the database engine/version, schema, data size, workload, driver and existing migration process. Use an ORM, query builder or parameterized SQL according to the project; an ORM does not replace authorization or safe parameter binding.

Use query plans and representative data to diagnose repeated queries and slow access. Choose selected columns and indexes for actual access patterns. SELECT *, batching, joins and foreign-key indexes have context-dependent tradeoffs; engine-specific indexing and locking behavior must be checked.

Choose transaction boundaries for the consistency invariant. Account for isolation, concurrent updates, deadlocks, retries and idempotent effects. Separate database commit from external side effects using the project's appropriate delivery mechanism.

For migrations, inspect locking/rewrite costs, compatibility with running versions and recovery requirements. Expand-and-contract is useful for compatible rolling changes; not every schema edit needs that ceremony. Destructive changes require authority covering the exact data and effect.

Size connection reuse and pools for the deployment lifecycle and database limit. Reuse safe process-level clients where supported; never put request-specific identity or authorization into shared mutable connection state.

## Code Examples

For a slow tenant-scoped list, preserve the tenant predicate, inspect the query plan and candidate composite index, then compare the same query/data before and after. A migration adding the index must account for the engine's build and locking behavior.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Verify authorization, empty results, concurrency and rollback/recovery cases relevant to the change.
- [ ] Measure query/locking behavior where performance is claimed; report untested production conditions.

## Common Mistakes

Creating indexes without a workload; assuming foreign-key index behavior is identical across engines; treating a successful helper as a committed migration.

## Integration Notes

Optional companion guidance: security, system-design, testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
