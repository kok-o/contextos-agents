# Playwright pattern

Use the project's existing Playwright configuration, baseURL and webServer setup.
The following illustrative test needs @playwright/test and a local /settings
page with a labeled Display name input, Save button and status feedback.
Choose the actual route and labels after inspecting the rendered application.

```typescript
import { test, expect } from '@playwright/test';

test('saves the display name', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/settings');
  await page.getByLabel('Display name').fill('Amina');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await expect(page.getByLabel('Display name')).toHaveValue('Amina');
  expect(errors).toEqual([]);
});
```

Assert persistence by reloading or reading the server result when that is part of
the contract. A successful response message alone does not prove persistence.
For a controlled failure, assert the recovery message and preservation of input.
If requests are intercepted, identify that scenario as a mocked interface test.

Use a fresh browser context or the project's isolated fixtures, bounded action
and assertion timeouts, and task-owned output paths. Store screenshots and traces
according to the project's data-handling rules.

Primary references: [web-first assertions](https://playwright.dev/docs/test-assertions),
[auto-waiting](https://playwright.dev/docs/actionability), and
[load-state caveats](https://playwright.dev/docs/api/class-page#page-wait-for-load-state).
