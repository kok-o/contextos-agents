---
name: ci-cd
description: Automates CI/CD pipeline setup. Enforces unskippable quality gates, shift-left static analysis, secret scanning, and hardened GitHub Actions workflows.
---

# CI/CD and Automation

Automate quality gates so no change reaches production without passing tests, lint, type checking, security scans, and build verification.

## Core Philosophy

- **Shift Left**: Catch problems as early in the delivery lifecycle as possible. A defect caught during static analysis or linting takes seconds to fix; the same defect discovered in production takes hours and damages reliability.
- **Faster is Safer**: Small, frequent, automated releases drastically lower blast radius and risk compared to infrequent bulk deployments.
- **Unskippable Gates Invariant**: Never disable a failing rule or skip a test suite just to make a pipeline green. Fix the root cause in the code.

## The Quality Gate Pipeline

Every Pull Request must successfully traverse these automated stages before merge approval:

```
Pull Request Opened
       │
       ▼
 1. Secret Scanning    (prevent credential leaks before running untrusted steps)
       │
       ▼
 2. Lint & Formatting  (eslint, prettier, markdownlint)
       │
       ▼
 3. Type Checking      (tsc --noEmit, pyright, mypy)
       │
       ▼
 4. Unit Tests         (vitest, jest, pytest with coverage thresholds)
       │
       ▼
 5. Production Build   (bundling, tree-shaking, static generation)
       │
       ▼
 6. Integration Tests  (API contracts, database migrations)
       │
       ▼
 7. Security Audit     (npm audit, trivy, dependency vulnerability checks)
       │
       ▼
 8. Bundle Budget      (bundle size checks against baseline thresholds)
       │
       ▼
   Merge Allowed
```

## Hardened Pipeline Standards

1. **Least-Privilege Token Permissions**:
   Explicitly declare workflow and job permissions at the top of the workflow file. Default to read-only access:
   ```yaml
   permissions:
     contents: read
   ```
2. **Deterministic Dependency Installation**:
   Always use frozen lockfiles (`npm ci` instead of `npm install`, `uv sync --frozen` instead of `pip install`).
3. **Concurrency Cancellation**:
   Automatically cancel in-progress runs when a newer commit is pushed to the same Pull Request branch:
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```
4. **Action Pinning**:
   Reference trusted actions using verified release tags (e.g. `actions/checkout@v4`) or full commit SHAs.
