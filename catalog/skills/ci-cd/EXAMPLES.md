# CI/CD - Examples & GitHub Actions Configurations

## Example 1: Production Quality Gate Workflow

```yaml
# .github/workflows/ci.yml
name: CI Quality Gates

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    name: Lint, Types & Security
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Secret Scan
        run: npm run check:secrets

      - name: Linter & Format Check
        run: npm run lint

      - name: Type Check
        run: npx tsc --noEmit

      - name: Unit Tests with Coverage
        run: npm test -- --coverage

      - name: Build Verification
        run: npm run build

      - name: Dependency Audit
        run: npm audit --audit-level=high
```

---

## Example 2: Polyglot Matrix Test Stage

```yaml
  test-matrix:
    name: Node Test Matrix
    needs: quality
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: ['20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm test
```
