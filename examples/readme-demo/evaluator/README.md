# Frozen independent evaluator

Keep this directory and its contents outside every project accessible to a model
until that model run has finished. Copy the finished project into a separate
evaluation environment and run:

```sh
node evaluator/evaluate.mjs --project finished-project --baseline fixture --initial condition-initial-project --out evaluation
```

Use Node.js 22.14.0. No packages are installed. `--initial` is the untouched
snapshot for that condition (including its original package manifest); it defaults
to `--baseline`. For condition C, pass `--initial` so a preinstalled ContextOS
dependency is not counted as an agent addition. The output must be an empty
directory outside all three input projects. Prefer a separate offline container
with only the candidate, evaluator, baseline, initial snapshot, and writable output
mounted: the evaluator executes the candidate code and tests.

`evaluation.json` includes all 15 independent cases, commands, actual exit codes,
timings, source hashes, test evidence, dependency changes, and changed paths.
stdout and stderr are retained separately for each subprocess. Each independent
case run is limited to 10 seconds; each test run to 15 seconds. A zero evaluator
exit code means the evaluation completed, not that the candidate passed. Inspect
the case results. Exit code 2 indicates that the case worker produced no report.

## Separate categories

- **Task: 3 checks.** The source differs from baseline, and single/multiple
  repeated ordinary-space groups are normalized. The request does not specify
  the exact whitespace contract; the task interpretation is declared before runs.
- **Preservation: 7 checks.** Named export, exact result shape, existing full
  `String.trim()` edge behavior, valid positive integer quantities, blank-name
  errors, nonpositive quantities, and fractional/nonfinite quantities.
- **Team contract: 5 checks.** Collapse ordinary U+0020 runs; preserve existing
  edge trim; preserve case, interior tabs, and interior nonbreaking spaces.
  Interior whitespace details are additional team knowledge, not an undisclosed
  regression criterion for condition A.

Several cases intentionally overlap. Do not sum these categories into a single
quality score. A versus B/C tests the effect of extra information. B versus C
compares its delivery only to the extent the supplied guidance is equivalent.

## Agent test usefulness

The evaluator discovers `.test`/`.spec` files in `test` or `tests` directories and
runs them directly with Node's test runner and type stripping. It records whether
test files changed and whether they pass on the final source. It then substitutes
the frozen original `src/order.ts` while keeping the final test suite. A useful
regression requires changed tests, a passing final suite, and an assertion failure
against the original implementation. A timeout, missing import, or syntax error
does not count as detection. Tests outside the discovery convention require
manual review and are not silently credited.

Three additional **canonical faulty implementations** test whether the final suite
catches broad `\s+` normalization, forced lowercase, and removed quantity
validation. These replace the whole module; this is not a comprehensive mutation
score of the agent's actual implementation. Existing public tests can catch some
of these variants, so variant detection does not by itself establish usefulness
of newly added tests. All command output and copies remain available for review.

Runtime checks do not prove absence of side effects or preservation of static
TypeScript types. Review source diffs and new dependencies separately. This
evaluator makes no claim about client instruction loading, resolver selection,
exports, model tokens, cost, or the commands the agent itself executed. Those need
independent client-event and configuration evidence.

## Evaluator self-check

Before model runs, execute `node evaluator/selfcheck.mjs`. It retains its temporary
oracle projects, command output, and evaluation reports. It checks three known
implementations: unchanged (task 0/3, preservation 7/7, team 1/5), correct (3/3,
7/7, 5/5), and broad-whitespace normalization (3/3, 7/7, 3/5). A minimal added
regression must detect the unchanged implementation but must not receive credit
for distinguishing tabs/NBSP when it does not test them. These are evaluator
oracle checks, never agent runs or comparison results.
