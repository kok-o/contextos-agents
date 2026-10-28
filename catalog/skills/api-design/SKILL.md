---
name: api-design
description: Design or review API contracts, compatibility, validation, errors,
  pagination and retry-safe operations.
---

# api-design

## Overview

Design or review API contracts, compatibility, validation, errors, pagination and retry-safe operations. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

An API or interface contract is being introduced, changed or reviewed. A small endpoint fix does not require redesigning the whole service.

## Rules & Patterns

Inspect actual consumers, existing conventions, authentication and versioning before changing a contract. Preserve compatible behavior or describe the deliberate migration required by the task. REST, RPC, events and framework-native actions are choices tied to consumers.

Define accepted input, output, ownership and failure cases. Validate untrusted fields at the boundary and authorize the requested object before protected reads or writes. Do not confuse a valid schema with permission. Use the project's established error envelope without exposing secrets or internal stack traces.

Choose pagination and ordering that remain stable for the data and workload. Bound expensive requests. For retried mutations, define key scope, request identity, concurrency, persistence and replay behavior where duplicate effects matter; a check-then-write in memory is not a concurrency-safe idempotency design.

Keep public names and identifiers useful to clients; internal implementation details are exposed only when intentionally part of the contract. Do not change HTTP status codes, field names or error semantics just to match a preferred style.

## Code Examples

For a retried payment request, scope the idempotency key to the authorized caller and operation, bind it to the request, and commit the effect and replay record atomically using the existing storage boundary. A read-only catalog endpoint needs pagination and cache semantics, not the same mutation protocol.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise allowed and denied callers, invalid input and the existing consumer contract.
- [ ] Check ordering, pagination boundaries and duplicate/concurrent requests when relevant.

## Common Mistakes

Inventing an API standard that breaks clients; trusting client tenant IDs; treating a local Map as durable idempotency; generating an unused schema without wiring its caller.

## Integration Notes

Optional companion guidance: security, testing, system-design. Use it only when relevant and available; the skill does not install tools or authorize external actions.
