# React — Best Practices

## Component Architecture

- **Prefer function components** with hooks over class components
- **One component per file** — name file same as component
- **Composition over inheritance** — use children and render props
- **Keep components small** — if > 150 lines, split it

## Hooks

- **useState** for local state, **useReducer** for complex state
- **useEffect** — always specify dependencies, clean up subscriptions
- **Custom hooks** — extract reusable logic into `use*` functions
- **useMemo/useCallback** — only when you have measured a performance problem

## State Management

- **Local state first** — don't reach for global state until you need it
- **Lift state up** — find the closest common ancestor
- **Context** — for cross-cutting concerns (theme, auth, locale)
- **External store** (Zustand, Jotai) — for truly global, frequently updated state

## Patterns

### Container/Presenter

```tsx
// Container — handles logic
function UserListContainer() {
  const users = useUsers();
  return <UserList users={users} />;
}

// Presenter — handles display
function UserList({ users }: { users: User[] }) {
  return <ul>{users.map(u => <UserItem key={u.id} user={u} />)}</ul>;
}
```

### Error Boundaries

- Wrap major sections in Error Boundaries
- Provide meaningful fallback UI
- Log errors to monitoring service

### Loading States

- Always handle: `loading`, `error`, `empty`, `data` states
- Use Suspense where supported
- Show skeleton screens, not spinners

## Performance

- **React.memo** — only for expensive renders with stable props
- **Code splitting** — lazy load routes and heavy components
- **Virtualization** — for lists > 100 items
- **Image optimization** — use next/image or lazy loading
- **Avoid** — inline object/array creation in JSX props

## Anti-Patterns (Avoid)

- [FAIL] Props drilling more than 2 levels — use Context or state management
- [FAIL] useEffect for derived state — use useMemo instead
- [FAIL] Index as key — use stable unique IDs
- [FAIL] Mutating state directly — always create new references
- [FAIL] God components — split into smaller, focused components
- [FAIL] Business logic in components — extract to hooks or services

## Testing

- **React Testing Library** — test behavior, not implementation
- Test user interactions, not component internals
- Mock API calls, not React hooks
- Use `screen.getByRole` over `getByTestId`

## File Structure

```
components/
  Button/
    Button.tsx
    Button.test.tsx
    Button.module.css
    index.ts
hooks/
  useAuth.ts
  useDebounce.ts
services/
  api.ts
types/
  user.ts
```
