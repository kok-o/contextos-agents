---
name: generators
description: Draft or update requested project documents using relevant
  templates and verified project facts.
---

# generators

## Overview

Draft or update requested project documents using relevant templates and verified project facts. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The user requests a specification, architecture note, API document, plan or related project documentation. Loading this skill does not request an entire document suite.

## Rules & Patterns

Inspect existing documentation, the requested audience and the current implementation. Generate only documents that serve the task; preserve established filenames and ownership.

Treat templates as optional structure. Replace placeholders with supported facts, or explicitly label an open question. Do not invent requirements, deployed services, completed tasks, estimates or stakeholder approval.

Separate current behavior, proposed work and acceptance evidence. A plan is not an implementation and a diagram is not runtime verification. Keep links and cross-document terminology consistent.

Ask only for missing decisions that materially affect the document. Continue useful work from available sources rather than forcing an interview or generating ten boilerplate files first.

## Code Examples

For a request to document an existing API, inspect routes and schemas and write the API reference. Reuse templates/API.md if useful; do not create a PRD, database migration and roadmap unless the task needs them.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Check links, source facts, unresolved placeholders and current/proposed status.
- [ ] Verify generated structure with the project's existing documentation tooling.

## Common Mistakes

Generating every template by default; presenting guesses as shipped behavior; marking placeholder tasks completed.

## Integration Notes

Optional companion guidance: decisions, architecture-diagrams. Use it only when relevant and available; the skill does not install tools or authorize external actions.
