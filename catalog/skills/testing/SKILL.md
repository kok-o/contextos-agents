---
name: testing
description: Vitest, React Testing Library, and Playwright testing standards. Enforces TDD/BDD, test pyramid, zero brittle mocks, and complete assertion coverage.
---

# Testing

## Overview

Testing strategy across unit, component, integration, and end-to-end testing suites using Vitest, React Testing Library, and Playwright.

## When to Use

Activate for any task involving unit tests, integration tests, E2E testing, TDD/BDD workflows, or fixing regression bugs.

## Rules & Patterns

### ️ The ContextOS Testing Pyramid

```
      /\
     /E2E\       10% — Playwright (Critical user journeys, auth, checkout)
    /-----\
   / Integ \     20% — API & Component Integration (RTL + MSW / Supertest)
  /---------\
 /   Unit    \   70% — Pure functions, Domain Entities, Utils (Vitest)
/-------------\
```

### Negative Constraints (What NOT to Do)

1. **NEVER mock internal implementation details**: Mock ONLY external I/O boundaries (HTTP network requests via MSW, Database via test containers or in-memory DB).
2. **NEVER test implementation details**: In React Testing Library, query by user-facing roles (`getByRole`, `getByLabelText`), NEVER by CSS selectors or internal component state.
3. **NEVER write assertions without an expected failure mode**: Each test must test a single logical behavior and fail if that behavior breaks.
4. **NEVER leave flaky tests or arbitrary sleep (`await delay(1000)`)**: Always use `waitFor()` or explicit event triggers with timeouts.
5. **NEVER share mutable state between tests**: Every test must have isolated state via `beforeEach()` setup and clean reset.

### AAA Standard Pattern

```typescript
describe('Feature / Unit', () => {
  it('should achieve expected outcome when given specific condition', async () => {
    // 1. ARRANGE
    const user = createTestUser({ role: 'admin' });
    // 2. ACT
    const result = await processOrder(user, sampleCart);
    // 3. ASSERT
    expect(result.status).toBe('confirmed');
  });
});
```

## Code Examples

See `EXAMPLES.md` for detailed anti-patterns and production testing code.

## Validation Checklist

- [ ] Tests follow Arrange-Act-Assert (AAA) structure
- [ ] No brittle CSS selectors or private state inspections
- [ ] Mocks isolated strictly to network/IO boundaries (MSW)
- [ ] Fast execution (< 5s for unit suite) with zero flaky sleeps

## Common Mistakes

- Over-mocking modules instead of running real pure logic. See `TROUBLESHOOTING.md`.

## Integration Notes

Interacts directly with `engineering-workflow` (Verify phase), `react`, and `typescript`.
