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
