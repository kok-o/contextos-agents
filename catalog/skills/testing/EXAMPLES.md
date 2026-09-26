# Testing Examples - Anti-patterns vs ContextOS Standard

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

---

## Example 3: End-to-End User Journey with Playwright

### Anti-pattern (Brittle CSS selectors and explicit sleeps)

```typescript
// BAD: XPath / brittle class selectors and fixed timer sleeps
test('creates new task', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000); // Brittle!
  await page.click('.btn-primary-small'); // Class name will change with CSS refactoring
});
```

### Best practice: ContextOS Standard (Accessible locators & auto-waiting)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Task Management Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate using baseURL configured in playwright.config.ts
    await page.goto('/tasks');
  });

  test('creates, completes, and deletes a task', async ({ page }) => {
    // 1. Fill input using accessible label
    const input = page.getByRole('textbox', { name: /new task title/i });
    await input.fill('Deploy production release');

    // 2. Click button using accessible role
    await page.getByRole('button', { name: /add task/i }).click();

    // 3. Auto-waiting assertion for item appearance
    const taskItem = page.getByRole('listitem').filter({ hasText: 'Deploy production release' });
    await expect(taskItem).toBeVisible();

    // 4. Toggle completion checkbox
    const checkbox = taskItem.getByRole('checkbox', { name: /mark as done/i });
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // 5. Delete task and verify disappearance
    await taskItem.getByRole('button', { name: /delete task/i }).click();
    await expect(taskItem).not.toBeVisible();
  });
});
```

