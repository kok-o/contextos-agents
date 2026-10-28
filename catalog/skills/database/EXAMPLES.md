# database scenarios

## In scope

For a slow tenant-scoped list, preserve the tenant predicate, inspect the query plan and candidate composite index, then compare the same query/data before and after. A migration adding the index must account for the engine's build and locking behavior.

## Verification

Verify authorization, empty results, concurrency and rollback/recovery cases relevant to the change.

Measure query/locking behavior where performance is claimed; report untested production conditions.

These scenarios describe what to verify. Prose is not proof that a framework, service or AI client executed the workflow. Use real project fixtures and report unavailable integrations.
