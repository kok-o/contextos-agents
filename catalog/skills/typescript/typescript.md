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
