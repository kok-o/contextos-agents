---
name: system-design
description: Make proportionate architecture decisions using actual
  requirements, boundaries, workloads and operational constraints.
---

# system-design

## Overview

Make proportionate architecture decisions using actual requirements, boundaries, workloads and operational constraints. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A consequential architecture choice, scaling issue or system boundary is in scope. A routine backend edit does not require a distributed-systems checklist.

## Rules & Patterns

Start with the actual product requirements, existing architecture, data lifecycle, workload and failure tolerance. Label estimates and unknowns rather than inventing scale or latency targets.

Choose the simplest design that meets those constraints. Monoliths, modules, queues, caches, service splits and partitions each have operational and consistency costs; none is a default badge of quality.

Identify identity/authorization boundaries, consistency invariants, failure paths and ownership. Discuss CAP in the context of network partitions and the actual consistency/availability requirements, not as a universal instruction to pick any two labels.

For serverless or long-lived processes, inspect connection, cold-start and resource lifecycle behavior. Safe client/pool reuse may belong at process scope; request-specific state does not. Verify provider and framework limits before prescribing a runtime or connection strategy.

Record meaningful tradeoffs and verification plans. Introduce extra layers, ADRs or diagrams where they clarify the change, rather than requiring them before any line of code.

## Code Examples

For a slow small backend, inspect the query and request path before proposing sharding or microservices. For a real service split, define data ownership, contracts, failure recovery and operational responsibility.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Trace requirements to the proposed behavior and relevant failure scenarios.
- [ ] Separate source inspection, capacity estimates and measured production evidence.

## Common Mistakes

Designing for invented scale; mandatory Redis/microservices; blanket bans on safe module-scope clients; declaring a diagram a deployed system.

## Integration Notes

Optional companion guidance: decisions, database, api-design. Use it only when relevant and available; the skill does not install tools or authorize external actions.
