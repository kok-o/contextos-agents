# TypeScript Examples — Anti-patterns vs ContextOS Standard

## Example 1: Type-Safe Parsing with Zod (No `any`)

### Anti-pattern: Anti-pattern (Blind type assertion with `as`)

```typescript
// BAD: using 'as User' bypasses runtime validation completely
async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  const data = await res.json();
  return data as User; // Runtime crash if payload changes!
}
```

### Best practice: ContextOS Standard (Runtime schema validation with Zod)

```typescript
// GOOD: guaranteed runtime and compile-time type safety
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'guest']),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
  const raw: unknown = await res.json();
  return UserSchema.parse(raw);
}
```

---

## Example 2: Discriminated Unions for State Handling

### Anti-pattern: Anti-pattern (Optional soup with boolean flags)

```typescript
// BAD: impossible states can be represented (e.g. isLoading: true AND error: 'Failed')
interface AsyncState<T> {
  data?: T;
  isLoading: boolean;
  error?: string;
}
```

### Best practice: ContextOS Standard (Discriminated Union)

```typescript
// GOOD: impossible states are impossible at compile-time
export type AsyncState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: Error };
```
