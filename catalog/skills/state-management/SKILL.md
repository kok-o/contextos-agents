---
name: state-management
description: Client and server state management standards using Zustand and TanStack Query. Enforces minimal global state, optimistic updates, and clean query invalidation.
---

# State Management

## Overview

Global client state and asynchronous server state architecture in modern React and Next.js applications using Zustand and TanStack Query v5.

## When to Use

Activate when managing asynchronous server data fetching, HTTP caching, optimistic UI updates, or global synchronous client UI state (modals, active filters, multi-step wizards, theme overrides).

## Rules & Patterns

### The Rule of Two States

1. **SERVER STATE (Async)**: Managed exclusively by TanStack Query (`useQuery`, `useMutation`). Handles HTTP caching, stale-while-revalidate, deduplication, background refetching, pagination, and query invalidation.
2. **CLIENT STATE (Sync)**: Managed by Zustand. Handles transient UI state: modal visibility, sidebar collapsed state, active filter values, wizard steps, and offline draft buffers.

### Negative Constraints (What NOT to Do)

1. **NEVER store server-fetched entity data in Zustand or Redux**: Store ONLY client-local UI state in Zustand. All API responses, lists, and entity records belong in TanStack Query.
2. **NEVER duplicate derived state**: Compute values inline or via `useMemo` from existing state instead of storing redundant state variables.
3. **NEVER subscribe to entire store objects in components**: Always use atomic selector functions (e.g. `useStore(state => state.isOpen)`) or `useShallow` to prevent unnecessary component re-renders.
4. **NEVER mutate state directly**: Always return new immutable state objects in Zustand setters.
5. **NEVER ignore optimistic rollback on mutation failure**: When implementing optimistic UI, always capture `previousData` in `onMutate` and restore it in `onError`.
6. **NEVER use ad-hoc array strings for query keys**: Always define and use a centralized Query Key Factory to guarantee consistent cache invalidation.

---

### Pattern 1: Zustand Slices Architecture

Split large global stores into focused, typed slices that compose into a single unified hook:

```typescript
import { create, StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UiSlice {
  isSidebarOpen: boolean;
  activeModal: string | null;
  toggleSidebar: () => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
}

const createUiSlice: StateCreator<UiSlice> = (set) => ({
  isSidebarOpen: true,
  activeModal: null,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  openModal: (modalId) => set({ activeModal: modalId }),
  closeModal: () => set({ activeModal: null }),
});

export const useAppStore = create<UiSlice>()(
  devtools((...args) => ({
    ...createUiSlice(...args),
  }))
);
```

---

### Pattern 2: Atomic Selectors & Re-render Prevention

Always pass specific selector functions to extract only the state your component needs:

```typescript
// [BAD] Subscribes to the entire store; re-renders on ANY store change
const { isSidebarOpen, activeModal } = useAppStore();

// [GOOD] Subscribes only to isSidebarOpen; re-renders ONLY when it changes
const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);

// [GOOD] Multiple values extracted without extra re-renders using useShallow
import { useShallow } from 'zustand/react/shallow';

const { isSidebarOpen, activeModal } = useAppStore(
  useShallow((state) => ({
    isSidebarOpen: state.isSidebarOpen,
    activeModal: state.activeModal,
  }))
);
```

---

### Pattern 3: TanStack Query Key Factory Standard

Maintain a structured hierarchy of query keys for predictable invalidation:

```typescript
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: ProjectFilters) => [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};
```

---

### Pattern 4: Optimistic Mutation with Rollback

Safely update UI instantly and roll back on network or server error:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectKeys } from './query-keys';

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updated: { id: string; name: string }) => api.patch(`/projects/${updated.id}`, updated),
    onMutate: async (newProject) => {
      // 1. Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(newProject.id) });

      // 2. Snapshot the previous value
      const previousProject = queryClient.getQueryData(projectKeys.detail(newProject.id));

      // 3. Optimistically update the cache
      queryClient.setQueryData(projectKeys.detail(newProject.id), (old: any) => ({
        ...old,
        ...newProject,
      }));

      // 4. Return context with snapshot for rollback
      return { previousProject, projectId: newProject.id };
    },
    onError: (err, newProject, context) => {
      // 5. Rollback to snapshot on failure
      if (context?.previousProject) {
        queryClient.setQueryData(projectKeys.detail(context.projectId), context.previousProject);
      }
    },
    onSettled: (data, err, variables) => {
      // 6. Always re-sync with server after error or success
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.id) });
    },
  });
}
```

---

## Validation Checklist

- [ ] Clear separation: Server state in TanStack Query, client UI state in Zustand.
- [ ] Atomic selectors or `useShallow` used on all store consumers.
- [ ] Centralized Query Key Factory used for all `queryKey` definitions.
- [ ] Optimistic mutations implement `onMutate`, `onError` rollback, and `onSettled` invalidation.
- [ ] Zero duplicated or redundant derived state stored in global stores.

## Common Mistakes

- **Storing API collections in Zustand**: Results in stale data and duplicate caching layers. Use TanStack Query.
- **Missing query cancellation in onMutate**: Causes race conditions between ongoing fetches and optimistic updates.
- **Forgetting atomic selectors**: Causes every component reading one store value to re-render when an unrelated value changes.

## Integration Notes

Interacts with `react`, `nextjs`, and `typescript`.
