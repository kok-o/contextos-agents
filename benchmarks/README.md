# ContextOS Benchmark

`npm run benchmark` is the current paired benchmark. It can call a model through an API or prepare equivalent prompts for manual runs in a chat UI. The API mode is the reproducible path; manual chat mode uses the same local evaluator but cannot control or inspect the chat platform's hidden context.

## Run against a model API

Set the provider's API key in the environment, then run the same task and arms together so the comparison is paired:

```powershell
$env:OPENAI_API_KEY = "paste-your-api-key-here"
npm run benchmark -- --provider openai --model "your-model-id" --task auth-security --arms a,c --repeats 5
```

Replace the quoted key and model ID with your own values before running.

Providers are `openai`, `gemini`, `anthropic`, and `custom` (an OpenAI-compatible endpoint with `--base-url`). The corresponding environment keys are `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `ANTHROPIC_API_KEY`. Do not place real keys in benchmark reports or committed files.

Run the full pilot across the four experimental arms with `--task all --arms a,b,c,d`. There are three tasks: `auth-security`, `ddd-order-invariants`, and `resilient-api-client`. `--repeats` accepts 1–100 generations for each task/arm. The default output directory is `benchmarks/results/v2`; use `--output` to choose another location.

The API client uses temperature `0.1` and the same user task and output-token cap for each arm. It retries selected transient errors up to three attempts. Token counts come from the provider's usage response. If any successful response or retry has no reportable usage, the aggregate is marked incomplete and the known subtotal is shown separately. Failed API and evaluator calls are reported separately from completed evaluations.

## Run through a chat UI

Create a prompt pack, run each prompt in a separate fresh chat with the same model and settings, save each full answer in the documented JSON format, then evaluate the responses locally:

```powershell
npm run benchmark:chat:pack -- --task auth-security --arms a,c --output ./chat-auth
# Save answers as ./responses/auth-security/<arm-id>.json
npm run benchmark:chat:eval -- --task auth-security --arms a,c --responses ./responses --manifest ./chat-auth/manifest.json --output ./chat-report
```

Each prompt file includes the benchmark system guidance and user task in one message for pasting. Copy the pack run ID and matching prompt SHA-256 from its README into each response JSON; chat evaluation verifies both values and re-hashes the prompt file from the supplied manifest. It rejects missing or mismatched provenance. A chat UI usually does not let this runner set a true system role or inspect the platform's system instructions, memory, routing, or project context. Keep the chats empty and comparable; treat these results as a manual approximation, not equivalent API evidence.

If the UI shows per-request input/output token counts, add them to the response JSON and set `usage.source` to `user_reported`. Otherwise leave the counts `null`; the benchmark will not estimate them from text length. API usage is provider-reported. Chat counts are exact only to the extent that the UI displays them and the operator records them correctly. The current v2 command has no dated pricing input, so monetary cost and cost per success are unavailable.

## What the arms compare

| Arm | Condition | What it tests |
| --- | --- | --- |
| A — Vanilla | Neutral engineering instruction | Baseline without ContextOS prompt context |
| B — Concise Checklist | General 12-rule checklist | Comparator for generic engineering guidance |
| C — ContextOS Resolver + Skills | Canonical resolver, its declaration, and the exact installed skill documents selected for the task | Effect of the installed ContextOS prompt context |
| D — Expanded Guidance | C plus risk/workflow prompt guidance | Prompt-only expansion; it does not run a separate agent, worktree, or reviewer |

ContextOS resolution uses an empty, fixed workspace fixture so repository-specific files cannot leak into the prompt. C/D also include the exact root `.agents/AGENTS.md` instructions. The report records resolver/compiler and manifest fingerprints, selected and included skill IDs, unresolved IDs, source paths, document hashes, and prompt hashes. Only skill documents present in the compiled manifest and on disk are included. A skill the resolver selects but cannot load is recorded as missing and its rules are not invented. In this checkout, `typescript` is selected but missing for auth and reliability, and `database`, `ddd`, and `system-design` are selected but missing for the DDD task. Those domain skill bodies are not part of the C/D prompt; inspect each run's `context` metadata for the exact context used.

The fairest product comparison is A versus C. B helps distinguish the effect of ContextOS context from generic process advice. D measures extra prompt guidance only. These comparisons include the token overhead of the added instructions; they are not token-matched experiments.

## Evaluation and limits

Every generated answer is extracted from one fenced code block, stripped from TypeScript to JavaScript, compiled, and checked against a task-specific local runtime suite. The primary outcome is `harness_verified_success`: all registered assertions pass, no recognized placeholder is present, compilation succeeds, and API-reported output tokens and generation time satisfy the configured budgets. This name is deliberate: the checks are performed by this repository's harness, not an independent human reviewer.

The suites exercise authentication, order invariants, and a resilient HTTP client. The auth worker substitutes deterministic bcrypt/Argon2-compatible interfaces backed by Node scrypt so password hashing, fresh salts, verification, and timing-safe comparison execute offline; it does not validate production KDF work factors or prove integration of the limiter into the login service. Some checks remain source-based (for example, framework/ORM boundary and an unexported 500-handler fallback); passing them does not prove the absence of every vulnerability. The compile gate is not a full TypeScript typecheck, package build, or repository regression suite.

There are only three fixed tasks. Wilson intervals and paired deltas are descriptive over the completed generations; repetitions are not new independent tasks. Success rates use completed evaluations as their denominator; API/evaluator errors and incomplete pairs are reported separately. Do not infer general performance across languages, repositories, models, or production coding sessions from this pilot.

Generated code runs in a separate Node process under the Node Permission Model (Node.js 22 or newer). This limits filesystem and process capabilities but is not a hardened container or OS boundary. Do not treat it as safe against actively hostile code.

## Results and historical artifacts

JSON run reports contain run-level outputs, statuses, the exact submitted prompt text and its hashes, ContextOS metadata, usage provenance, local oracle results, and code provenance. Chat runs also retain the verified prompt-pack ID; the Markdown file is a summary. A dirty working tree is marked `dirty`, and benchmark source hashes are saved with the report. Treat `benchmarks/results/v2` as run output, not automatically approved product evidence.

Old aggregate reports without raw prompts, task-level records, usage metadata, or reproducible provenance were removed. `benchmarks/evidence/v1/context-reduction-report.json` remains only as an invalidation tombstone referenced by claims governance; it is not a valid result. `benchmarks/evidence/v2/w7-dogfood-gate.json` is workflow/test-gate evidence, not an LLM benchmark result.

Other provider-backed runners remain in the repository for compatibility, but they use different task sets and evaluators. Do not mix their historical or future results with v2. Their default output folders are `benchmarks/results/issues`, `benchmarks/results/legacy/live`, `benchmarks/results/legacy/runtime`, and `benchmarks/results/legacy/multi-runtime`.
