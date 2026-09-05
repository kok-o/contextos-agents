# ponytail-mindset Examples — Anti-patterns vs ContextOS Standard

## Example 1: Data Formatting and Manipulation

### Anti-pattern: Over-engineered Custom Utility Class

```typescript
// BAD: 40 lines of boilerplate for relative date formatting
export class DateFormatterService {
  private static instance: DateFormatterService;
  public static getInstance() { /* singleton boilerplate */ }
  public formatRelative(date: Date): string {
    const diff = Date.now() - date.getTime();
    // 30 lines of manual math, plurals, and string building
  }
}
```

### Best practice: ContextOS Standard (Standard Library Native API)

```typescript
// GOOD: Native Intl API, zero bundle cost, handles all locales
export const formatRelativeTime = (date: Date, locale = 'en'): string => {
  const diffDays = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diffDays, 'day');
};
```

---

## Example 2: Component Library Reuse

### Anti-pattern: Hand-rolled Modal from Scratch

```text
BAD: Writing custom overlay DOM, manual scroll locking, manual focus trapping,
and custom keydown listeners. Burns 300+ lines of fragile code.
```

### Best practice: ContextOS Standard (Leverage Established Primitives)

```bash
# GOOD: Install battle-tested primitive that handles ARIA, portals, and keyboard navigation
npx shadcn@latest add dialog
```
