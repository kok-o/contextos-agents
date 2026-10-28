# api-design scenarios

## In scope

For a retried payment request, scope the idempotency key to the authorized caller and operation, bind it to the request, and commit the effect and replay record atomically using the existing storage boundary. A read-only catalog endpoint needs pagination and cache semantics, not the same mutation protocol.

## Verification

Exercise allowed and denied callers, invalid input and the existing consumer contract.

Check ordering, pagination boundaries and duplicate/concurrent requests when relevant.

These scenarios describe what to verify. Prose is not proof that a framework, service or AI client executed the workflow. Use real project fixtures and report unavailable integrations.
