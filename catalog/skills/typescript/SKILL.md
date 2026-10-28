---
name: typescript
description: Use TypeScript types, narrowing and compiler checks to express real
  contracts without hiding runtime uncertainty.
---

# typescript

## Overview

Use TypeScript types, narrowing and compiler checks to express real contracts without hiding runtime uncertainty. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task affects TypeScript or explicitly asks for typed JavaScript tooling. A JavaScript-only project need not be migrated to TypeScript.

## Rules & Patterns

Inspect compiler version, configuration and library types. Strengthen checks proportionately and account for migration cost rather than enabling every strict option during an unrelated edit.

Use unknown at untrusted boundaries and validate the required shape before narrowing. Types disappear at runtime; a valid role field does not establish caller identity or authorization.

Prefer useful inference and clear domain contracts. Explicit public return types, discriminated unions and readonly types help when they protect a real boundary. Choose interface or type according to the existing code and the construct needed.

Avoid assertions that conceal a missing invariant. A justified assertion, non-null assertion or localized any may be needed for an inspected API or interop boundary; contain it and explain the invariant instead of applying a universal ban.

Keep compiler guarantees distinct from runtime behavior. Readonly/as const do not deeply freeze arbitrary runtime objects. Run the project's typecheck and relevant behavior tests.

## Code Examples

The original isUser block below validates every required field and rejects arrays. It checks data shape; separately authorize any protected operation. The other snippets are illustrative typing patterns, not a complete service.

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

<!-- example: typescript-user-guard -->
```typescript
export interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

export function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && 'id' in value && typeof value.id === 'string'
    && 'name' in value && typeof value.name === 'string'
    && 'role' in value && (value.role === 'admin' || value.role === 'user');
}
```

```typescript
// Repository pattern
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

## Validation Checklist

- [ ] Typecheck against the installed configuration and dependencies.
- [ ] Exercise runtime input validation and meaningful invalid cases where relevant.

## Common Mistakes

Using as to hide unvalidated input; claiming typechecking proves authorization; rewriting valid types solely for stylistic uniformity.

## Integration Notes

Optional companion guidance: testing, security. Use it only when relevant and available; the skill does not install tools or authorize external actions.
