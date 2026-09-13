# ContextOS Benchmark v2 Protocol

This document describes the implemented API and manual-chat pilot. It does not describe the older mock/demo protocol or the aspirational 30-task protocol as completed work.

## Scope and entry points

- `npm run benchmark` calls a selected model API and evaluates its generated code locally.
- `npm run benchmark:chat:pack` creates prompts for a human-operated chat comparison.
- `npm run benchmark:chat:eval` applies the same task oracle to saved chat answers without making model calls.

The API mode is the reproducible comparison. Chat mode can compare answers manually, but the runner cannot set the UI's true system message or observe hidden platform context and exact usage. Provider-backed legacy commands in `package.json` use different protocols and must be reported separately.

## Experimental design

For each task and repetition, the harness sends identical task text and output-token limits to the selected arms at requested temperature `0.1`. API run records save the output-token limit, temperature and whether the provider client applied it, maximum attempts, and request timeout. Some reasoning models ignore temperature; reports mark that explicitly. The arms vary only the system guidance/context:

1. **A — Vanilla:** neutral software-engineering instruction.
2. **B — Concise Checklist:** generic twelve-rule checklist.
3. **C — ContextOS Resolver + Skills:** canonical resolver output, compiled declaration, and exact bytes of installed skill documents selected for the task.
4. **D — Expanded Guidance:** C plus risk/workflow prompt guidance. It does not execute an isolated agent worktree or reviewer pipeline.

The C/D resolver runs against a fixed empty-workspace fixture and the compiled manifest from this checkout. Both arms also include the exact root `.agents/AGENTS.md` instructions. Task-specified skill names are audit annotations only; they do not force selection. Missing or unresolved skill IDs are recorded and no placeholder instructions are injected for them. In the current checkout, `typescript` is missing for auth/reliability, while `database`, `ddd`, and `system-design` are missing for DDD; those skill bodies are not included. Run reports include resolver/compiler/manifest fingerprints, selected/included/missing IDs, hashes and paths for included documents, and prompt hashes. A/B report no ContextOS context.

A versus C estimates the effect of adding the installed, resolver-selected ContextOS prompt context to this fixed task set, including its input-token overhead. B is a generic checklist comparator. D tests extra workflow/risk wording only. The task, model, and inference settings are paired, but the experiment does not hold input-token count constant.

## Tasks and oracle

The pilot has three TypeScript tasks registered in `benchmarks/lib/runtime-suites.js`:

| Task | Main behavioral checks |
| --- | --- |
| `auth-security` | Password verification, attempt limiting, error leakage, input validation, and a signed JWT with bounded expiry and issuer/audience claims |
| `ddd-order-invariants` | Immutable Money, matching currencies, totals, order transitions, and domain events |
| `resilient-api-client` | Real abort behavior against a local fetch mock, circuit-breaker state transitions, and typed errors |

`harness_verified_success` requires a complete code block, successful TypeScript stripping/JavaScript compilation, every registered runtime assertion passing, no recognized placeholder pattern, and—during API runs—available output-token and latency data within the configured budgets. Chat imports do not require UI token counts to pass the behavioral oracle; their token data is informational and labeled with its source.

The oracle is implemented by the same repository that produces the result, not independently audited. The auth worker substitutes offline bcrypt/Argon2-compatible interfaces backed by Node scrypt, so it exercises salted hashing, verification, and timing-safe comparison but does not validate production KDF work factors or prove that the limiter is wired into the login service. Some checks still rely on source inspection, including selected security-pattern and repository-boundary checks. This pilot does not run `tsc`, the package's full build/test suite, an external security scanner, or a human reviewer. It therefore supports narrow task-level comparisons, not claims that generated code is generally secure or production-ready.

Generated code is run in a separate child process with Node's Permission Model. Use Node.js 22 or newer. The permission-limited process is defense in depth, not an OS/container sandbox or guarantee against actively hostile code.

## Token accounting and reports

API input, output, total, reasoning, and cached-token fields are taken from provider usage metadata when returned. The OpenAI-compatible client requests streaming usage; gateways may omit it. A failed or retried request without usage metadata is counted as an unavailable attempt. Any unknown attempt makes the corresponding aggregate incomplete while retaining known token subtotals. Do not infer token counts from characters, words, or model context-window size.

Chat UI token values can be imported only as `user_reported` when the UI displays them. Otherwise counts stay unavailable. Each imported answer must carry the run ID and SHA-256 of its prompt from the original chat pack; evaluation re-hashes the prompt file and rejects missing or mismatched provenance. This prevents accidental attribution of a stale answer to a newer pack, though the runner cannot verify what was actually pasted into a hidden chat UI or measure its hidden system instructions and other platform context. The current protocol has no dated price table, so reports do not claim monetary cost or cost per success.

Reports are written under `benchmarks/results/v2` by default. JSON run reports contain per-run output, evaluation status, provider/model, generation settings, exact submitted prompt text and hashes, ContextOS context metadata, token provenance, and source hashes; Markdown files are summaries. Chat reports retain the verified prompt-pack run ID and source provenance. This makes the exact prompt inspectable even when the working tree is dirty; the recorded Git commit and clean/dirty status still identify the implementation used to generate and evaluate it.

## Statistical interpretation

Each completed task/arm/repetition produces one binary harness outcome. Wilson 95% intervals and paired success deltas are descriptive summaries over generated runs on this fixed set; repetitions share the same three tasks and do not add task diversity. Failed API/evaluator calls are shown separately and excluded from the success-rate denominator. Paired comparisons omit incomplete pairs and report their count.

Three tasks are too few to establish broad generalization or to validate product marketing claims. A stronger evaluation needs a larger frozen task set, broader languages/repositories, independent review of task oracles, and recorded model versions/settings. Benchmark runs do not automatically alter `benchmarks/claims.json`.

## Historical evidence

Prior aggregate reports without reproducible task-level inputs and token/provenance records have been removed from active results. The invalidated v1 context-reduction artifact remains only as a claims-governance tombstone. The W7 dogfood gate is implementation test evidence, not a model benchmark. Do not cite either as evidence that ContextOS improves generated-code quality.
