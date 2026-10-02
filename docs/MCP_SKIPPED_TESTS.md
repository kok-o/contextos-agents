# MCP skipped-test inventory

The 1 October Windows run recorded 599 passed and 25 skipped. Counts below refer
to that baseline; the final JSON report is the authority for each new run.

| File / baseline count | Reason | Coverage gap and release disposition |
| --- | --- | --- |
| `tests/integration/repl-protocol.test.ts` / 13 | Probe used `python3`; runtime uses `python` on Windows. Python was unavailable under that probe. | Startup, persistent variables, FINAL strings/numbers/reset, stdout, context, callbacks, division/name errors and recovery, shutdown, multiline execution and abort. Probe now matches runtime and validates Python 3. Python execution remains experimental; skips remain visible in CI JSON. |
| `tests/unit/contextos-tools.test.ts` / 10 | Legacy expectations: six default tools, old delegation parameters/session APIs. Default is now three read-only tools. | Registration, sync/async delegation, path rejection, status, compare, diff success/missing thread, merge and cleanup. Registration and four read-only cases restored with current inspection/diff mocks. Added runtime opt-in, no session creation and missing repository checks. Five execution handler tests remain skipped; delegation, mutation boundaries, merge and cleanup are not certified by them. |
| `tests/unit/session-persistence.test.ts` / 2 | Legacy snapshot expectations after migration to ThreadStore. Crash test writes a snapshot but loader reads ThreadStore; `sequence` is thread count, not a durable update counter. | Crash interruption/cost retention and monotonic multi-update sequencing are not certified. Integration tests cover ThreadStore roundtrip, async jobs, lock/reconciliation and orphan fingerprints, without establishing crash recovery or multiprocess atomicity. Runtime recovery remains experimental. |

## Supported release boundary

Stable R2 scope: core compilation/selection/export and default read-only MCP
inspection. Installed archive acceptance exercises real initialize, tools/list
and status calls. Handler tests check compare/diff without creating runtime
sessions; this is not end-to-end execution evidence.

`--enable-runtime` opts into experimental delegation, merge and cleanup. No stable
support is claimed for paid provider execution, Python sandbox isolation, crash
recovery, concurrent runtime persistence, automatic merges or cleanup durability.
An AST restriction test does not certify an isolation boundary for untrusted code.

## Repeat and inspect

```sh
npm --prefix contextos-mcp run build
npm --prefix contextos-mcp test -- --reporter=default --reporter=json --outputFile=../scratch/mcp-tests.json
```

CI retains logs and JSON assertions, including skipped names. Python absence
reduces experimental coverage; stable handler or installed archive failures block
R2. The preparation report records actual counts and environment failures.
