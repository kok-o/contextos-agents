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
