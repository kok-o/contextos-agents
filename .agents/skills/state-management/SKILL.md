---
name: state-management
description: >
  Client and server state management standards using Zustand and TanStack Query. Enforces minimal global state, optimistic updates, and clean query invalidation.
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


<!-- Source: EXAMPLES.md -->

# State Management Examples — Anti-patterns vs ContextOS Standard

## Example 1: Selecting State from Zustand

### Anti-pattern: Anti-pattern (Subscribing to full store causes unnecessary renders)

```typescript
// BAD: component re-renders whenever ANY property in the store changes!
function CartBadge() {
  const store = useCartStore(); // subscribes to entire object!
  return <span>{store.items.length}</span>;
}
```

### Best practice: ContextOS Standard (Atomic granular selector)

```typescript
// GOOD: component ONLY re-renders when itemCount changes
function CartBadge() {
  const itemCount = useCartStore((state) => state.items.length);
  return <span>{itemCount}</span>;
}
```

---

## Example 2: Server State Invalidation

### Anti-pattern: Anti-pattern (Manually syncing server data into global state with useEffect)

```typescript
// BAD: manual sync, race conditions, stale cache bugs
function UserProfile({ userId }) {
  const { setUser } = useUserStore();
  useEffect(() => {
    fetch(`/api/users/${userId}`).then(res => res.json()).then(setUser);
  }, [userId]);
}
```

### Best practice: ContextOS Standard (Declarative TanStack Query caching)

```typescript
// GOOD: automatic caching, deduplication, background revalidation
function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => fetchUserById(userId),
    staleTime: 1000 * 60 * 5, // 5 minutes fresh
  });

  if (isLoading) return <SkeletonLoader />;
  if (error) return <ErrorMessage error={error} />;
  return <UserDetails user={user} />;
}
```

<!-- Source: TROUBLESHOOTING.md -->

# State Management Troubleshooting Guide

## Common Issues & Fixes

### 1. Infinite re-renders when calling `useStore` with an inline object selector

- **Cause**: Returning a new object reference from a selector without a custom equality check.
- **Fix**: Use `useShallow` from `zustand/react/shallow` or select scalar values directly.

### 2. Stale data shown after mutation

- **Cause**: Missing `queryClient.invalidateQueries` in `onSettled` or `onSuccess`.
- **Fix**: Always invalidate the relevant query keys on mutation completion to trigger background refetch.

### 3. Server-Side Rendering (SSR) Hydration Mismatch in Next.js

- **Cause**: Reading localStorage-persisted Zustand store directly during initial SSR render.
- **Fix**: Use a custom `useHydratedStore` hook or render persisted components only after client mount.
