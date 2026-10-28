# microservices scenarios

## In scope

An order/payment flow records which component owns each state transition and what happens if payment succeeds but notification fails. Verify replay and compensation behavior; do not claim exactly-once effects from a message ID alone.

## Verification

Exercise relevant timeout, duplicate, partial-failure and recovery paths.

Verify contract compatibility and authorization across the actual boundary.

These scenarios describe what to verify. Prose is not proof that a framework, service or AI client executed the workflow. Use real project fixtures and report unavailable integrations.
