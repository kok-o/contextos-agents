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
