# CI/CD - Troubleshooting & Common Edge Cases

## Common Diagnostic Scenarios

### 1. Flaky Integration Tests in CI Environments

- **Symptom**: Test suite randomly fails in GitHub Actions but always passes on developer machines.
- **Root Cause**: Race conditions, port collisions, unawaited background tasks, or timezone dependencies (`new Date().getHours()`) differing between UTC runners and local environments.
- **Fix Protocol**:
  1. Fix runner timezones to UTC in CI setup steps (`TZ: 'UTC'`).
  2. Eliminate hardcoded ports in integration tests; use ephemeral ports (`0`) or testcontainers.
  3. Ensure all asynchronous operations and database transactions are explicitly awaited before asserting and tearing down.
  4. Never use `retry` plugins to mask flaky tests; isolate the asynchronous race condition.

---

### 2. GitHub Actions Token Permission Denied (`Resource not accessible by integration`)

- **Symptom**: CI workflow fails at the checkout, comment, or release stage with an authorization error.
- **Root Cause**: The repository enforces secure defaults with read-only tokens, but the workflow needs to write statuses, PR comments, or packages.
- **Fix Protocol**:
  - Declare explicit, least-privilege permissions at the job level rather than granting global admin rights:
    ```yaml
    jobs:
      comment-pr:
        runs-on: ubuntu-latest
        permissions:
          contents: read
          pull-requests: write
    ```

---

### 3. Exceeded Runner Minutes & Slow CI Builds

- **Symptom**: Workflow takes > 15 minutes to run, exhausting GitHub Actions free-tier minutes.
- **Root Cause**: Running `npm install` without package manager caching, sequential execution of independent checks, and missing concurrency cancellation.
- **Fix Protocol**:
  1. Use `actions/setup-node@v4` with `cache: 'npm'` to reuse cached node_modules across runs.
  2. Split monolithic jobs into parallel jobs: run lint, type-check, and unit tests concurrently.
  3. Add `concurrency` cancellation to cancel stale builds when a developer pushes new commits to an open PR.

---

### 4. Bundle Size Budget Check Failures

- **Symptom**: PR fails on `bundlesize` check with `Bundle size exceeded by 4.2 KB`.
- **Root Cause**: An imported third-party library pulled in heavy un-treeshaken dependencies or large date/locale libraries.
- **Fix Protocol**:
  1. Inspect the bundle visualizer or source map explorer.
  2. Replace broad root imports (`import { map } from 'lodash'`) with direct submodule imports (`import map from 'lodash/map'`).
  3. Dynamically import heavy UI widgets (modals, charts, rich text editors) using `React.lazy()` or `next/dynamic`.
