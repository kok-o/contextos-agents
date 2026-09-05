---
name: ponytail-mindset
description: >
  >
---
# ponytail-mindset

## Overview

Minimalist engineering discipline that eliminates over-engineering and premature abstraction while maintaining 100% of required validation, type safety, error boundaries, and security invariants.

## When to Use

Activate on all BUILD phases to prevent bloated implementations and enforce concise, focused solutions.

## Rules & Patterns

Based on [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

> _He says nothing. He writes one line. It works._

**Benchmark**: 54% less code on average. 94% less in over-build scenarios. 100% safe (validation, error handling, security: never cut).

---

### Core Principle

> **The best code is code you don't write.**  
> Write only what the task strictly needs. Lazy about the solution, never about reading and understanding.

---

### The 7-Rung Decision Ladder

**Before writing ANY code**, stop and check each rung in order. Stop at the first rung that holds:

```text
1. Does this need to exist?
   → No: YAGNI — skip it entirely. Don't build for "future use."

2. Already in this codebase or component library?
   → Yes: Reuse it. Don't rewrite. Call the existing function/component/module.
   → For UI: Check shadcn/ui FIRST. Before building a complex UI element from scratch, check if it exists in the component library. If yes, generate the install command: npx shadcn@latest add dialog — never manually rewrite what shadcn already provides.

3. Standard library does it?
   → Yes: Use it. Don't write formatDate() — use Intl.DateTimeFormat or dayjs.

4. Native platform feature?
   → Yes: Use it. Don't install flatpickr when <input type="date"> exists.
   → Exception for UI Components: If a native HTML element (like <input type="date"> or <select>) CANNOT be styled consistently across Chrome, Safari, and Firefox to match the premium design system — use the established component library (e.g., shadcn/ui <DatePicker>, <Select>) instead. Cross-browser inconsistency is a legitimate reason to NOT use native.

5. Already-installed dependency?
   → Yes: Use it. Don't install a new library to do what an existing one can.

6. Can it be done in one line?
   → Yes: One line. No abstraction layer needed.

7. Only then: write the MINIMUM that works.
   → No classes when a function works. No module when an inline does.
```

---

### The Rule of Three (Do Not Abstract Early)

- **First occurrence**: Write it inline directly where it is needed.
- **Second occurrence**: Duplicate it cleanly. Duplication is cheaper than the wrong abstraction.
- **Third occurrence**: Only now extract a shared helper or utility.

---

### 10 Concrete Over-Engineering Red Flags

1. Creating a `GenericRepository<T>` when you only have 2 database tables.
2. Creating a custom state machine or complex reducer for 2 boolean flags.
3. Adding a configuration file or environment variables for values that never change.
4. Writing custom retry/circuit-breaker logic when native `fetch` or SDK already handles it.
5. Building a generic `BaseService` with 15 hook methods implemented by only one class.
6. Wrapping every standard library call in a custom helper class (`StringUtils`, `DateUtils`, `ObjectUtils`).
7. Creating a multi-level folder structure (`domains/auth/adapters/driving/rest/controllers/dto/`) for a 30-line microservice.
8. Writing custom mock frameworks when Vitest/Jest/Node test runner provide standard mocks.
9. Installing a 50KB npm package for a 3-line utility (e.g. `left-pad`, `is-number`, `deep-clone`).
10. Pre-optimizing caching and indexing for endpoints serving 10 requests a day.

---

### The Sacred Exceptions (NEVER Cut These)

The ladder applies to features and abstractions. These 4 areas are **non-negotiable** and **never simplified away**:

#### 1. Input Validation

```javascript
// [GOOD] Always validate — even if "internal" API
function createUser(data) {
  if (!data.email || !isValidEmail(data.email)) {
    throw new ValidationError('Invalid email');
  }
  return db.insert('users', data);
}

// [BAD] Never skip validation for "speed"
function createUser(data) {
  return db.insert('users', data); // NEVER
}
```

#### 2. Error Handling

```javascript
// [GOOD] Always handle errors explicitly
async function fetchUser(id) {
  try {
    const user = await db.findById(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    return user;
  } catch (err) {
    logger.error('fetchUser failed', { id, err });
    throw err;
  }
}
```

#### 3. Security Checks

- Authorization check BEFORE every query or mutation.
- Parameterized queries everywhere — zero string concatenation in SQL.
- Strict sanitization of all rendered HTML and markdown.

#### 4. Type Safety & Behavioral Tests

- Strict TypeScript types — no `any` evasion.
- Tests covering happy path, 4xx, and 5xx edge cases.

---

## Code Examples

### Native Platform vs Over-Built Package

**Over-build**:

```bash
npm install flatpickr
# Creates DatePickerWrapper.jsx (45 lines) + useDatePicker.js (30 lines) + styles (60 lines)
```

**Ponytail approach (rung 4)**:

```html
<input type="date" name="date" aria-label="Appointment date" />
```

### Next.js App Router Server Action vs REST Endpoint

```typescript
// Instead of /api/users/[id]/route.ts + custom fetch wrapper:
"use server";

export async function updateUser(id: string, data: UpdateUserInput) {
  const session = await getSession(); // auth check — never skip
  if (session?.userId !== id) throw new Error("Forbidden");
  return db.users.update(id, data);
}
```

---

## Validation Checklist

- [ ] Every new dependency has been verified: cannot be solved with native platform or existing dependencies.
- [ ] No single-use abstractions, wrappers, or interfaces created.
- [ ] Sacred exceptions preserved: 100% input validation, explicit error handling, security checks intact.
- [ ] All code written passes all existing unit and integration tests.

---

## Common Mistakes

- **Cutting validation to write less code**: The goal is less architecture/boilerplate, never less safety.
- **Creating utilities "for future use"**: Only write utilities when used 3+ times.
- **Rewriting component libraries**: Building custom modals, tabs, or tooltips from scratch when shadcn/ui or Radix is already in the project.

---

## Integration Notes

- Runs at the start of every `[PHASE: Build]` and `[PHASE: Review]`.
- Enforces minimalism alongside `system-design` (think at scale, implement minimally).
- Pairs with `impeccable-design` for UI tasks.


<!-- Source: EXAMPLES.md -->

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

<!-- Source: TROUBLESHOOTING.md -->

# ponytail-mindset Troubleshooting & Common Mistakes

## 1. Conflating Minimalism with Cutting Safety Guards

- **Symptom**: Agent removes input validation, error handling, or security checks in the name of "less code".
- **Root Cause**: Misunderstanding the Ponytail principle. Ponytail cuts unnecessary abstractions, never safety invariants.
- **Fix**: Invariant: Always retain 100% of input sanitization, error boundaries, and type safety checks.

## 2. "Just In Case" Speculative Coding (YAGNI Violation)

- **Symptom**: Adding config options, generics, and plugin interfaces for features not requested.
- **Root Cause**: Premature future-proofing.
- **Fix**: Apply Rung 1 of the ladder: If it doesn't solve the immediate requirement, do not write it.

## 3. Reinventing Installed Dependencies

- **Symptom**: Writing a deep-clone helper when Lodash or native structuredClone is available.
- **Root Cause**: Skipping inspection of package.json and runtime environment.
- **Fix**: Inspect installed dependencies before writing utility functions.
