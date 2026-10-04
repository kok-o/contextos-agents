# MCP skipped-test inventory

Updated 4 October 2026. The 1 October Windows baseline recorded 599 passed and
25 skipped. The published maintenance run recorded 623 passed and seven skipped.
Those release records remain historical evidence, not counts for the working tree.

## Restored local coverage

| Original gap | Current check | Remaining boundary |
| --- | --- | --- |
| Python protocol / 13 baseline skips | Probe matches the runtime's `python` executable and requires Python 3. | Conditional skips remain when Python is absent; runtime isolation is experimental. |
| Five execution handler skips | Current runtime opt-in and explicit `write_scope` contract; synchronous/async delegation, path rejection, merge eligibility and cleanup. Additional checks reject missing scope and stale merge evidence. | Unit handlers use controlled dependencies; these checks do not exercise paid providers. |
| Two persistence skips | Legacy snapshots stay read-only until migration; five distinct same-process writes preserve threads. A separate child records running state, is killed, and real reconciliation retains cost while marking interrupted/unknown work. | No claim about arbitrary mid-write termination, power loss or multiprocess atomicity. `sequence` is a thread count, not a durable update counter. |

No unconditional skipped tests remain in these suites. The JSON from each full
run records actual executed and skipped cases; a filtered run's excluded tests
must not be reported as project skips.

## Execution cycle

`tests/integration.test.ts` exercises real temporary Git worktrees, persisted
state, independent Node verification and merge checks with a deterministic
executor fixture. Its first patch claims completion but fails behavior checks.
A repair passes; editing the accepted worktree invalidates the evidence and
blocks merge. A fresh verified candidate merges and passes the base-repository
test. The executor fixture does not invoke an LLM API.

## Supported boundary

Stable scope remains compilation/selection/export and default read-only MCP
inspection. Installed archive acceptance exercises initialize, tools/list and
status calls. `--enable-runtime` opts into experimental delegation, merge and
cleanup. These tests improve regression coverage without certifying paid
provider execution, OS sandbox isolation, power-loss durability or unrestricted
concurrent persistence. An AST restriction is not an isolation boundary.

Vitest defaults to at most two workers to keep local memory use bounded.
Worker concurrency can be explicitly overridden for a measured CI environment.

## Reproduce

From `contextos-mcp`:

```sh
npm run build
node node_modules/vitest/vitest.mjs run --reporter=default --reporter=json --outputFile=../scratch/mcp-tests.json
```

Direct invocation forwards reporter flags consistently on Windows. Python
absence reduces experimental coverage and remains visible in the JSON report.
See [the local improvement record](RELIABILITY_IMPROVEMENTS.md) for current results.
