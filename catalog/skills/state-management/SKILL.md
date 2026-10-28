---
name: state-management
description: Choose and implement state ownership, synchronization,
  subscriptions and mutation recovery in frontend applications.
---

# state-management

## Overview

Choose and implement state ownership, synchronization, subscriptions and mutation recovery in frontend applications. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A state ownership, synchronization or update problem is in scope. Respect the existing React state/data stack rather than automatically introducing Zustand or TanStack Query.

## Rules & Patterns

Identify authoritative state, derived values, URL state, transient UI state and server data. Keep each source of truth understandable and avoid unnecessary duplicate writable copies.

Use the project's existing data/cache utilities where suitable. Server data can be managed by a framework, query library or another deliberate architecture; it does not universally belong in one package.

Subscribe to the data actually needed and inspect rerender behavior before optimizing. Use selectors/equality APIs compatible with the installed version. A centralized key factory may help larger caches but is not required for every query.

Define invalidation, cancellation and stale-response behavior. When optimistic UI is appropriate, handle failed and overlapping mutations without restoring stale data over a newer successful change.

Scope caches and stores to the right user/request boundary. Shared client or server state must not leak identity or tenant-specific data across sessions.

## Code Examples

For a filterable catalog, determine which filters belong in the URL, which state is local and which results come from the server. For optimistic editing, test overlapping updates and failure recovery rather than only a successful click.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise stale responses, relevant concurrency, invalidation and reset/session boundaries.
- [ ] Verify subscriptions and persisted effects at the appropriate layer.

## Common Mistakes

Introducing a global store for a local toggle; forcing a specific library; restoring obsolete optimistic snapshots; using global server request state.

## Integration Notes

Optional companion guidance: react, typescript, webapp-testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
