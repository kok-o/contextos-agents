# Recorded README demo results

Date: 4 October 2026. Candidate: **published contextos-agents 2.3.1**. Native client: **Codex CLI 0.149.1**, model **gpt-6.1-sol / medium**, Linux Node **22.14.0**. The working checkout is not the tested package.

**All nine attempts solved the task, preserved existing behavior, and added useful regression tests.** The exact team contract passed in 0/3 A runs and 3/3 B and C runs. A reasonably chose broad whitespace normalization; the undisclosed tab/NBSP convention is additional team information, not a violated explicit user instruction. No quality advantage over manual rule delivery was measured.

This is one deliberately small illustrative scenario, not a claim about production policy or general agent superiority.

| Run | Task | Existing behavior | Exact team contract | Useful tests | Team body loading | Wall seconds |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| [A1](evidence/runs/A1/evaluation.json) | 3/3 | 7/7 | 3/5 | Yes | N/A | 43.309 |
| [B1](evidence/runs/B1/evaluation.json) | 3/3 | 7/7 | 5/5 | Yes | native AGENTS body injected | 40.052 |
| [C1](evidence/runs/C1/evaluation.json) | 3/3 | 7/7 | 5/5 | Yes | native skill body read | 47.890 |
| [B2](evidence/runs/B2/evaluation.json) | 3/3 | 7/7 | 5/5 | Yes | native AGENTS body injected | 64.825 |
| [C2](evidence/runs/C2/evaluation.json) | 3/3 | 7/7 | 5/5 | Yes | native skill body read | 41.552 |
| [A2](evidence/runs/A2/evaluation.json) | 3/3 | 7/7 | 3/5 | Yes | N/A | 41.591 |
| [C3](evidence/runs/C3/evaluation.json) | 3/3 | 7/7 | 5/5 | Yes | native skill body read | 46.298 |
| [A3](evidence/runs/A3/evaluation.json) | 3/3 | 7/7 | 3/5 | Yes | N/A | 39.087 |
| [B3](evidence/runs/B3/evaluation.json) | 3/3 | 7/7 | 5/5 | Yes | native AGENTS body injected | 37.591 |

The table follows the preregistered run order. Every attempt completed with client exit 0; there were no timeouts or substituted attempts. Each run had one fresh session and no human repair. Source/test snapshots, diffs, client events, commands and independent outputs are linked under each run.

## What changed

A1/A3 used `item.trim().replace(/\s+/g, " ")`; A2 used the equivalent Unicode-flag form. B/C used `/ +/g` or `/ {2,}/g`, preserving interior tabs and nonbreaking spaces. Existing edge trimming, error messages, return shape and quantity validation remained unchanged. Manual review confirmed that the only source edit in each run was the normalization expression: no network, database access or new dependency was added.

Every final agent test suite passed in the evaluator and failed by assertion when paired with the original implementation. This establishes useful regression coverage for the requested change, not comprehensive test adequacy. Three additional canonical faulty implementations were evaluated and recorded separately. A1/A2/A3 also documented their chosen semantics in README.md. B/C changed only src/order.ts and the existing test file.

## Instruction evidence and limits

- Native initial requests have identical built-in-instruction and tool-definition hashes across all nine runs. A has no ContextOS/team-rule input; five common Codex bundled system skills remain available.
- B includes the full team body in native AGENTS.md context. C initially contains only skill metadata, then has recorded successful reads of the complete native team-order body. No condition received an explicit skill mention in its task.
- B has byte-identical copies of the nine native skill entrypoints/resources available in C, plus the project instruction reference. Actual activation is different: B loads the team body immediately; C chooses native documents. C also has adapter-specific generated files, and C1 read CONVENTIONS.md. These exports derive from the same source guidance, but B does not have that exact generated wrapper. B/C therefore compare delivery configurations, not a perfectly isolated resolver treatment.
- The preparation resolver explicitly selected team-order and TypeScript alongside engineering-workflow and ponytail-mindset. Ordinary export created nine skills and 151 managed artifacts. It did not use the resolver query as an export filter.
- All agent containers had fresh homes and repositories, with no host home/project mounts and no hidden evaluators. No API credential was copied into a container. Real native request bodies were captured before inference and during every run. Provider prompt caching can affect tokens and timings; fresh sessions do not disable it.
- The native CLI used a recording transport proxy. It did not inject prompts; Codex loaded AGENTS/skills and operated the shell itself. This is native CLI loader evidence for this version and fixture, not an API-only prompt injection experiment.
- Some attempts tried an unavailable apply_patch executable, and some ran expected failing tests before fixing code. These intermediate command failures are retained in events; they are not hidden by the final exit status. The environment and model-visible tools were the same for every arm.
- Node type stripping executes TypeScript but is not a static TypeScript compiler. Public annotations were reviewed in the diffs; no tsc run is claimed.

Loaded native bodies confirmed by complete text in successful tool output:

- C1: context-manager, engineering-workflow, team-order, typescript. [Read events](evidence/runs/C1/events.jsonl).
- C2: context-manager, engineering-workflow, team-order, typescript. [Read events](evidence/runs/C2/events.jsonl).
- C3: engineering-workflow, team-order, typescript. [Read events](evidence/runs/C3/events.jsonl).

## Telemetry

| Condition | Mean wall seconds | Input tokens | Cached input | Output tokens | Token-rate estimate USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 41.329 | 195,901 | 163,553 | 4,699 | 0.144179 |
| B | 47.489 | 383,475 | 328,248 | 5,596 | 0.226809 |
| C | 45.247 | 266,750 | 222,283 | 5,413 | 0.187490 |

Total: **77 provider requests, 402.195 seconds of client wall time, $0.5584779 token-rate estimate**. The conservative reservation ledger retained $0.698276, below the user-approved $5 cap. Invoice cost is **not measured**. Input/output/cache figures come from completed provider telemetry. Each run's wall time starts when Codex launches and includes transport overhead; it excludes fixture copying, evaluation and rendering. There is no general speed, token or cost saving claim.

The model rate card was checked on 4 October: [official gpt-6.1-sol documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol). Standard rates per million tokens: $2 input, $0.10 cached input, $2.50 cache write, $10 output. The native progressive-disclosure behavior is described in [official skill documentation](https://learn.chatgpt.com/docs/build-skills).

## Installation defect retained, no candidate replacement

The first preparation attempt using `init --minimal` failed with exit 1 because copied CommonJS `.agents/ctx.js` inherited the ESM fixture package scope. Direct `node .agents/ctx.js export gemini` reproduced `ReferenceError: require is not defined in ES module scope`. The published package was not patched. The documented `--skip-compile` flag followed by installed CLI commands succeeded. The [original failure](evidence/setup/failed-esm-bootstrap.json) and [successful setup commands](evidence/setup/commands.json) are retained. The earlier housekeeping preparation and diagnostic flag experiments remain in the private original work folder; none used model inference.

The final preparation installed the public npm archive with SHA-256 `c11d5d4d36f2703f7733a8e2d1d9d9fb311635db6b71d2fcc6b09a37967c7ad0`, matching the repository release manifest, which associates it with source revision `eb39867568c448bb1c394e9470c99287897b1295`. The working repository HEAD at setup was `9796456b04228dad63eb21fef4a5ac1663f40b04`, with pre-existing uncommitted changes preserved separately.

## Drift scene

In a separate post-freeze copy, the source team rule gained an 80-character limit. Compile succeeded; export check returned `hasDrift: true`, `hasError: false`, 20 findings, exit 1. After export, the check returned `hasDrift: false`, 0 findings, 151 projections, exit 0. [Commands and JSON](evidence/drift/commands.json).

**This is a configuration-consistency check.** The new length limit was not added to application code and no new model session applied it. It is not a code-quality check or behavior guarantee.

## Reproduction and evidence

- [Short reproduction instructions](README.md) and [frozen protocol](PROTOCOL.md).
- [Machine-readable comparison](results.json), [evidence hashes](evidence/manifest.json), [recorded request/response archive](evidence/recorded-transport.zip).
- [Setup manifest](evidence/setup/preparation.json), [exact medium-reasoning baseline request](evidence/isolation/A0-request.json), [offline loader preflight](evidence/isolation/offline-probe-summary.json).
- [Evaluator definition and its positive/negative self-checks](evaluator/README.md).

Host-specific path prefixes are labelled in this public-ready evidence copy. Original bytes are retained locally outside the repository. No keys or HTTP authorization headers are included. No files have been pushed or uploaded.

## Media

MP4 and GIF are clearly labelled **Replay of recorded runs**. The first attempt of each arm supplies detailed excerpts; every repetition appears in the full-video table. Shortened waiting is labelled **Sped up**. English on-screen text and SRT accompany locally synthesized Russian narration. Render sources and narration are retained. See media-QA.json for final duration, decoding, frame inspection and subtitle checks.
