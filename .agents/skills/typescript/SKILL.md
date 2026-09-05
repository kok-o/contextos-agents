---
name: TypeScript
description: >
  ContextOS skill for TypeScript
---
# TypeScript

## Overview

Strict TypeScript engineering standard. Enforces noImplicitAny, discriminated unions, branded types, immutability, exhaustive switch checks, and zero unsafe any or as unknown as T casts.

## When to Use

Activate on all TypeScript and JavaScript codebases to ensure compile-time type safety, robust domain modeling, and foolproof function contracts.

## Negative Constraints (What NOT to Do)

1. **NEVER use `any`**: Use `unknown` with type guards, discriminated unions, or Zod schemas.
2. **NEVER use type assertions (`as Type` or `as unknown as Type`) to bypass safety**: Fix the underlying type signature or use runtime narrowing (`instanceof`, `typeof`, `in`).
3. **NEVER use non-null assertions (`foo!.bar`)**: Handle `null` and `undefined` with optional chaining (`?.`) or explicit error guards.
4. **NEVER export mutable global arrays or object constants**: Always mark constant objects and arrays with `as const` and `readonly`.
5. **NEVER omit explicit return types on exported functions**: Exported public APIs must declare explicit return types to protect consumers.

## Rules & Patterns

## Strict Mode

Always use strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## Types

- **Prefer `interface`** for object shapes, `type` for unions/intersections
- **No `any`** — use `unknown` if type is truly unknown, then narrow
- **Explicit return types** for exported functions
- **Const assertions** — `as const` for literal types

```typescript
// Good
interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

// Unions
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

## Utility Types

- `Partial<T>` — all properties optional
- `Required<T>` — all properties required
- `Pick<T, K>` — select specific properties
- `Omit<T, K>` — remove specific properties
- `Record<K, V>` — key-value map

## Type Guards

```typescript
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value;
}
```

## Generic Patterns

```typescript
// Repository pattern
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

## Anti-Patterns

- [FAIL] `any` — use `unknown` + type guards
- [FAIL] Type assertions (`as`) — prefer type guards
- [FAIL] Non-null assertions (`!`) — handle null explicitly
- [FAIL] Enums — prefer union types or `as const` objects
- [FAIL] Complex generics without JSDoc — document intent


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


<!-- Source: EXAMPLES.md -->

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

<!-- Source: TROUBLESHOOTING.md -->

# typescript Troubleshooting & Common Mistakes

## 1. Excessive Use of `any` or `as unknown as T`

- **Symptom**: Runtime `TypeError: Cannot read properties of undefined` in supposedly typed TypeScript code.
- **Root Cause**: Bypassing type checking with `any` or forceful type assertions.
- **Fix**: Use `unknown` with type guards, Zod schemas, or discriminated unions.

## 2. Non-Exhaustive Switch on Unions

- **Symptom**: New union member added but some switch statements fail to handle it, producing bugs.
- **Root Cause**: Missing exhaustive type checking in `default:` case.
- **Fix**: Add `default: const _exhaustive: never = action; throw new Error(_exhaustive);` to let the compiler catch missing branches.

## 3. Inaccurate Generics Constraints

- **Symptom**: Generic functions that lose type inference and resolve to `unknown`.
- **Root Cause**: Over-specifying generics or missing `extends` constraints.
- **Fix**: Constrain generics narrowly: `function get<T, K extends keyof T>(obj: T, key: K): T[K]`.

<!-- Source: typescript.md -->

# TypeScript — Best Practices

## Strict Mode

Always use strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## Types

- **Prefer `interface`** for object shapes, `type` for unions/intersections
- **No `any`** — use `unknown` if type is truly unknown, then narrow
- **Explicit return types** for exported functions
- **Const assertions** — `as const` for literal types

```typescript
// Good
interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

// Unions
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

## Utility Types

- `Partial<T>` — all properties optional
- `Required<T>` — all properties required
- `Pick<T, K>` — select specific properties
- `Omit<T, K>` — remove specific properties
- `Record<K, V>` — key-value map

## Type Guards

```typescript
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value;
}
```

## Generic Patterns

```typescript
// Repository pattern
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

## Anti-Patterns

- [FAIL] `any` — use `unknown` + type guards
- [FAIL] Type assertions (`as`) — prefer type guards
- [FAIL] Non-null assertions (`!`) — handle null explicitly
- [FAIL] Enums — prefer union types or `as const` objects
- [FAIL] Complex generics without JSDoc — document intent
