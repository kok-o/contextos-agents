# ContextOS: бюджетное API-сравнение

Вывод: в 16 полных парах focused и all-installed прошли по 6 проверок из 16;
vanilla — 8/16. Focused стоил примерно на 37,8% меньше all-installed,
но улучшение качества или стоимости относительно vanilla не подтверждено.
Четыре ответа из 54 не получены из-за provider limit 50 requests/day.
Это малая выборка одного model snapshot, не общий рейтинг режимов.

Model: `gpt-4.1-mini-2025-04-14`. 54 requested, 50 completed, 4 API errors, 0 evaluator errors.

Six fixed tasks, three contexts, three repetitions. One HTTP attempt; maximum 4096 output tokens; rotated comparator order. All installed and focused use the same isolated consumer with 11 installed entrypoints. This evaluates assembled prompts, not a native coding-client session.

| Context | Completed | Verified successes | Rate | Known token cost | Known cost / success | Measured input | Cached input | Measured output |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vanilla | 16 | 8 | 50% | $0.032868 | $0.004109 | 4227 | 0 | 19486 |
| All installed (11 entrypoints) | 17 | 7 | 41.2% | $0.075775 | $0.010825 | 251202 | 188800 | 19959 |
| Focused ContextOS | 17 | 7 | 41.2% | $0.046997 | $0.006714 | 67464 | 37376 | 19515 |

Balanced comparison: 16 complete task/repetition pairs, with all three contexts represented.

| Context | Verified successes | Known cost in pairs | Input tokens in pairs | Output tokens in pairs |
| --- | ---: | ---: | ---: | ---: |
| Vanilla | 8/16 | $0.032868 | 4227 | 19486 |
| All installed (11 entrypoints) | 6/16 | $0.073507 | 236520 | 19500 |
| Focused ContextOS | 6/16 | $0.045753 | 63882 | 18985 |

| Task | Vanilla | All installed | Focused |
| --- | ---: | ---: | ---: |
| auth-security | 2/3 | 1/3 | 0/3 |
| ddd-order-invariants | 0/3 | 1/3 | 0/3 |
| resilient-api-client | 3/3 | 3/3 | 3/3 |
| safe-pagination | 0/3 | 0/3 | 0/3 |
| stable-dependency-sort | 2/3 | 0/3 | 3/3 |
| nested-secret-redaction | 1/1 | 2/2 | 1/2 |

Known provider token cost: **$0.155640**. Persistent reservation across both launches: **$2.836962**, including the sandbox EACCES launch. Authorization limit: $10. Cost is calculated from provider usage and the [official model rates](https://developers.openai.com/api/docs/models/gpt-4.1-mini); it is not an invoice.

Raw report: `scratch/live-benchmark/2026-09-30T18-03-29-593Z/report-reevaluated.json` (SHA-256 `862903b36343c637cee22ce8914d97a252450ae6bbaae62ed2ebcbe8c4adef39`). Raw requests, responses and usage remain alongside the report in ignored scratch/. Curated outcomes and source hashes: [portable evidence](evidence/implementation-2026-09-30.json).

## Evaluation limits

Primary outcome is harness_verified_success: native TypeScript transform and syntax gate, registered runtime assertions, placeholder checks and usage/time constraints. The original evaluator damaged valid source; its quality totals are superseded by this offline reevaluation of the same saved answers. It does not include full TypeScript type checking. JWT/bcrypt use local mocks; network behavior uses deterministic local assertions. Passing does not establish production security. Code runs in a permission-limited child with a minimal environment; this is not a hardened OS sandbox.

Known costs and measured token counts include received answers only; failed API requests have unavailable usage and retained reservations. Scores use completed evaluator runs. Four RPD-limited requests leave the last task unbalanced; compare complete task/repetition pairs for any quality inference.

The additional original TypeScript syntax audit used TypeScript 5.9.3, without source repair: 50 checked, 0 invalid.

Three repetitions of six fixed tasks are a small model-specific sample. Outcome rates do not estimate performance across arbitrary repositories. Cache hits, token cost and character counts are different metrics. Long-session client history was not tested.

## Failed checks

- auth-security / Focused ContextOS / 1: Runtime oracle failed: 4/5; Security vulnerabilities detected: input-sanitization-validation. input-sanitization-validation: Malformed login email must use a validation status (400 or 422), got 401
- auth-security / Vanilla / 1: Runtime oracle failed: 4/5; Security vulnerabilities detected: input-sanitization-validation. input-sanitization-validation: Malformed login email must use a validation status (400 or 422), got 401
- auth-security / All installed (11 entrypoints) / 2: Runtime oracle failed: 4/5; Security vulnerabilities detected: input-sanitization-validation. input-sanitization-validation: Malformed login email must use a validation status (400 or 422), got 401
- auth-security / Focused ContextOS / 2: Runtime oracle failed: 4/5; Security vulnerabilities detected: input-sanitization-validation. input-sanitization-validation: Malformed login email must use a validation status (400 or 422), got 401
- auth-security / All installed (11 entrypoints) / 3: Runtime oracle failed: 4/5; Security vulnerabilities detected: input-sanitization-validation. input-sanitization-validation: Malformed login email must return a validation error status (400 or 422)
- auth-security / Focused ContextOS / 3: Runtime oracle failed: 4/5; Security vulnerabilities detected: input-sanitization-validation. input-sanitization-validation: Malformed login email must use a validation status (400 or 422), got 401
- ddd-order-invariants / Vanilla / 1: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_status' of object '#<Order>'; domain-events-emission: Cannot assign to read only property 'domainEvents' of object '#<Order>'
- ddd-order-invariants / All installed (11 entrypoints) / 1: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_items' of object '#<Order>'; domain-events-emission: Cannot assign to read only property '_items' of object '#<Order>'
- ddd-order-invariants / Focused ContextOS / 1: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_items' of object '#<Order>'; domain-events-emission: Cannot assign to read only property '_items' of object '#<Order>'
- ddd-order-invariants / All installed (11 entrypoints) / 2: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_status' of object '#<Order>'; domain-events-emission: Cannot assign to read only property '_status' of object '#<Order>'
- ddd-order-invariants / Focused ContextOS / 2: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_items' of object '#<Order>'; domain-events-emission: Cannot assign to read only property '_items' of object '#<Order>'
- ddd-order-invariants / Vanilla / 2: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_items' of object '#<Order>'; domain-events-emission: Cannot assign to read only property 'domainEvents' of object '#<Order>'
- ddd-order-invariants / Focused ContextOS / 3: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_items' of object '#<Order>'; domain-events-emission: Cannot assign to read only property '_items' of object '#<Order>'
- ddd-order-invariants / Vanilla / 3: Runtime oracle failed: 2/4. order-state-invariants: Cannot assign to read only property '_status' of object '#<Order>'; domain-events-emission: Cannot assign to read only property 'domainEvents' of object '#<Order>'
- safe-pagination / All installed (11 entrypoints) / 1: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / Focused ContextOS / 1: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / Vanilla / 1: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / Focused ContextOS / 2: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / Vanilla / 2: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / All installed (11 entrypoints) / 2: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / Vanilla / 3: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / All installed (11 entrypoints) / 3: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- safe-pagination / Focused ContextOS / 3: Runtime oracle failed: 2/3; Security vulnerabilities detected: pagination-input-security. pagination-input-security: Missing expected exception.
- stable-dependency-sort / All installed (11 entrypoints) / 1: Runtime oracle failed: 1/3. sort-determinism: Cycle detected or unresolved dependencies involving: a; sort-immutability: Cycle detected or unresolved dependencies involving: a
- stable-dependency-sort / All installed (11 entrypoints) / 2: Runtime oracle failed: 1/3. sort-determinism: Cycle detected in dependency graph; sort-immutability: Cycle detected in dependency graph
- stable-dependency-sort / Vanilla / 3: Runtime oracle failed: 1/3. sort-determinism: Cycle detected in dependencies; sort-immutability: Cycle detected in dependencies
- stable-dependency-sort / All installed (11 entrypoints) / 3: Runtime oracle failed: 1/3. sort-determinism: Cycle detected in dependencies; sort-immutability: Cycle detected in dependencies
- nested-secret-redaction / Focused ContextOS / 1: Runtime oracle failed: 2/3; Security vulnerabilities detected: redaction-prototype-security. redaction-prototype-security: Cycle detected in input
- nested-secret-redaction / Vanilla / 2: OpenAI API 429, RPD limit 50; usage unavailable.
- nested-secret-redaction / Focused ContextOS / 3: OpenAI API 429, RPD limit 50; usage unavailable.
- nested-secret-redaction / Vanilla / 3: OpenAI API 429, RPD limit 50; usage unavailable.
- nested-secret-redaction / All installed (11 entrypoints) / 3: OpenAI API 429, RPD limit 50; usage unavailable.
