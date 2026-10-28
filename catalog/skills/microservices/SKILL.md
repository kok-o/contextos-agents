---
name: microservices
description: Design or diagnose service boundaries, distributed consistency,
  contracts and failure handling when a distributed architecture is justified.
---

# microservices

## Overview

Design or diagnose service boundaries, distributed consistency, contracts and failure handling when a distributed architecture is justified. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

Existing services interact, or the user is evaluating a concrete service split. A backend feature alone is not a reason to introduce microservices.

## Rules & Patterns

Identify independent ownership, deployment, scaling and data requirements. Compare the proposed split with the current architecture, including a modular monolith when suitable.

Define contract versions, identity/authorization propagation, timeouts and bounded retries. Delivery guarantees depend on the broker and configuration; consumers still need a plan for duplicate, delayed and out-of-order messages.

Choose consistency boundaries and recovery before selecting sagas, orchestration or choreography. These patterns are options, not mandatory ceremony for every multi-step flow.

Use observability and failure scenarios to diagnose a distributed issue. Account for partial completion, external side effects and how operators identify and repair stuck work.

## Code Examples

An order/payment flow records which component owns each state transition and what happens if payment succeeds but notification fails. Verify replay and compensation behavior; do not claim exactly-once effects from a message ID alone.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise relevant timeout, duplicate, partial-failure and recovery paths.
- [ ] Verify contract compatibility and authorization across the actual boundary.

## Common Mistakes

Splitting services for fashion; assuming all brokers provide the same delivery mode; unbounded retries; inventing a saga without a recovery owner.

## Integration Notes

Optional companion guidance: system-design, api-design, database. Use it only when relevant and available; the skill does not install tools or authorize external actions.
