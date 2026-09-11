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
