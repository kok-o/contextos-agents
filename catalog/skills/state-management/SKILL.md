---
name: state-management
description: Client and server state management standards using Zustand and TanStack Query. Enforces minimal global state, optimistic updates, and clean query invalidation.
---

# State Management

## Overview

Global client state and server state management in modern React and Next.js applications using Zustand and TanStack Query.

## When to Use

Activate when managing asynchronous server data fetching/caching, optimistic UI updates, or global UI client state (modals, filters, wizards).

## Rules & Patterns

### The Rule of Two States

- **SERVER STATE (Async)**: Managed exclusively by TanStack Query (`useQuery`, `useMutation`). Caching, background refetching, pagination, and invalidation.
- **CLIENT STATE (Sync)**: Managed by Zustand. Modal visibility, active filters, wizard step, theme.

### Negative Constraints (What NOT to Do)

1. **NEVER store server-fetched data in Zustand or Redux stores**: Store ONLY client-local UI state in Zustand. All API data belongs in TanStack Query.
2. **NEVER duplicate derived state**: Compute values inline or via `useMemo` from existing state instead of storing redundant state variables.
3. **NEVER subscribe to entire store objects in components**: Always use atomic selector functions (e.g. `useStore(state => state.isOpen)`) to prevent unnecessary component re-renders.
4. **NEVER mutate state directly**: Always return new immutable state objects in Zustand setters.
5. **NEVER ignore optimistic rollback on mutation failure**: When implementing optimistic UI, always capture `previousData` in `onMutate` and restore it in `onError`.

## Code Examples

See `EXAMPLES.md` for Zustand store patterns and optimistic TanStack mutations.

## Validation Checklist

- [ ] Clear separation between Server (TanStack Query) and Client (Zustand) state
- [ ] Atomic selectors used on all Zustand hook calls
- [ ] Optimistic updates implement rollback on error
- [ ] Zero duplicated derived state

## Common Mistakes

- Subscribing to full store objects causing cascading re-renders. See `TROUBLESHOOTING.md`.

## Integration Notes

Interacts with `react`, `nextjs`, and `typescript`.
