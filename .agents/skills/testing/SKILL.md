---
name: testing
description: >
  Vitest, React Testing Library, and Playwright testing standards. Enforces TDD/BDD, test pyramid, zero brittle mocks, and complete assertion coverage.
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


<!-- Source: EXAMPLES.md -->

# Testing Examples — Anti-patterns vs ContextOS Standard

## Example 1: React Component Testing

### Anti-pattern: Anti-pattern (Brittle query & implementation coupling)

```typescript
// BAD: querying by CSS class or test-id and testing internal state
test('submits form', async () => {
  const wrapper = render(<LoginForm />);
  const input = wrapper.container.querySelector('.email-input');
  fireEvent.change(input, { target: { value: 'user@test.com' } });
  fireEvent.click(wrapper.container.querySelector('#submit-btn'));
  expect(wrapper.state().isSubmitted).toBe(true); // Brittle!
});
```

### Best practice: ContextOS Standard (User-centric role queries & userEvent)

```typescript
// GOOD: user-facing roles, userEvent, async wait
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

test('submits form with valid user credentials', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/email address/i), 'user@test.com');
  await user.type(screen.getByLabelText(/password/i), 'SecureP@ss123!');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'user@test.com',
    password: 'SecureP@ss123!'
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
```

---

## Example 2: API Mocking with MSW (Mock Service Worker)

### Anti-pattern: Anti-pattern (Hardcoded global fetch monkey-patching)

```typescript
// BAD: globally overwriting fetch breaks other tests and hides actual contract
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ data: 'ok' })
});
```

### Best practice: ContextOS Standard (Network boundary mocking)

```typescript
// GOOD: declarative MSW network handler
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const server = setupServer(
  http.get('/api/users/:id', ({ params }) => {
    if (params.id === '404') {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ id: params.id, name: 'Alice Smith' });
  })
);
```

<!-- Source: TROUBLESHOOTING.md -->

# Testing Troubleshooting Guide

## Common Issues & Fixes

### 1. `act(...)` warning in React Testing Library

- **Cause**: An asynchronous state update triggered after the test completed.
- **Fix**: Ensure all async operations are awaited using `await waitFor(() => ...)` or `await screen.findByRole(...)`.

### 2. Tests pass in isolation but fail in concurrent test runs

- **Cause**: Shared in-memory state or un-reset singleton.
- **Fix**: Reset all mocks and in-memory databases in `beforeEach(() => vi.clearAllMocks())` and `afterEach(() => cleanup())`.

### 3. Playwright timeout waiting for selector

- **Cause**: Element is animating or blocked behind a modal/overlay.
- **Fix**: Use web-first assertions like `await expect(page.getByRole('button')).toBeVisible()` which automatically retry until timeout.
