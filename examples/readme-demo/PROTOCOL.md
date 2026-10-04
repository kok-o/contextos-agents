# Preregistered README demonstration

Frozen before model inference on 4 October 2026. This is one scenario with three
repetitions per condition, not evidence of general model superiority.

## Candidate and task

- Published `contextos-agents@2.3.1`, pinned npm integrity and archive SHA-256 in
  the preparation manifest. No current checkout changes enter the package.
- Starting code: `fixture/`; identical `src/order.ts` and public tests in all arms.
  It already trims edges and validates inputs, but does not collapse internal
  ordinary spaces. The requested task therefore requires a source change.
- Identical user request: exact bytes of `task.txt`. It contains no skill mention.
- Team policy: exact `team-order/SKILL.md` body. Preserve catalog label case and
  meaningful interior tabs/NBSP while collapsing ordinary U+0020 space runs.
- The published ESM bootstrap defect was found before model runs and retained
  separately: `init --minimal` exits 1 when the copied CommonJS `ctx.js` inherits
  the fixture's `type: module`. Use documented `--skip-compile`, then invoke the
  installed `npx --no-install contextos` for compile/export. No package fix or
  post-result candidate substitution is used.

## Conditions

| Arm | Team rule delivery | Other guidance available |
| --- | --- | --- |
| A | None | Common Codex bundled instructions/skills only |
| B | Body always loaded from root AGENTS.md | Manual index and byte-identical copies of all C native skill documents/resources |
| C | Exported native `.agents/skills/team-order` | Seven core skills, TypeScript, team-order, and ContextOS exports |

The B/C bodies and available resources are checked by SHA-256. Availability is
not identical to activation: B's team body is immediate, C's body requires native
selection/read. The manual index itself differs from Codex's native skills index.
This comparison cannot isolate a resolver algorithm effect. The separate
`resolve ... @team-order ...` preparation command explicitly requests the rule;
ordinary export is not filtered by that resolver call. No explicit-activation
model run is included in the nine-run matrix.

## Client, isolation, and limits

- Codex CLI **0.149.1**, Node **22.14.0**, Linux Docker image pinned by digest.
- Model **gpt-6.1-sol**, reasoning **medium**, provider service tier `default`.
- Native Codex builds all prompts and executes tools. A host-only local proxy
  records Responses requests, fixes model/reasoning/output limits, and enforces
  spending reservations. It does not inject team instructions into prompts.
- One fresh container/process/home/repository per attempt; no shared session,
  no host project/home mount, no evaluator or other-condition files mounted.
- Plugins, apps, memory, browser, image generation, web search, and delegation
  disabled. No real API credential enters the containers. A random local proxy
  token is the only client credential. No API call is allowed until the user
  authorizes a concrete monetary cap.
- Identical tool definitions and built-in instructions checked in captured
  native requests. A must contain no ContextOS/team-order instructions or paths.
  Common bundled Codex system skills remain present and are disclosed.
- Maximum **180 seconds**, **12 model requests**, **4096 output tokens per
  request**, **one attempt with no manual repair** per run. Whole series cap:
  **30 minutes**, **USD 5 maximum only after approval**. No automatic paid retries.
- The proxy uses the repository's conservative guard: byte-count input upper
  bound, protocol headroom, maximum cache-write rate, output cap, 25% headroom;
  reserves before HTTP and retains reservations for uncertain/failed requests.
  Only local unbilled tool types are permitted. Rates verified against the
  [model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol):
  input $2, cached input $0.10, cache write $2.50, output $10 per million tokens.

## Run order and evaluation

Fixed balanced order: **A1, B1, C1, B2, C2, A2, C3, A3, B3**.

The independent evaluator and oracle self-checks were frozen before inference.
Their hashes are in `evaluator/frozen-inputs.json`. Agents cannot see these files.
Evaluate copied results after the run, in a separate offline Docker container.

- Task: 3 checks. Preservation: 7 checks. Exact team contract: 5 checks.
- Report categories separately; overlapping cases are not a total quality score.
- A missing undisclosed team policy is not a violation of A's explicit prompt.
- Run final agent tests independently. Useful regression tests must pass on the
  final implementation and fail by assertion on the original implementation.
- Inspect diffs, public TypeScript API, added dependencies, extra files and effects.
- For B: confirm the body in the native request. For C: require a recorded
  successful file read with the full body, or explicit body injection evidence.
  Metadata, a filename, a claim by the model, and a green export check are insufficient.
- Retain every timeout, error and incomplete attempt in the matrix. Stop the
  series on provider/guard errors rather than silently replacing a result.
- Client-observed wall time comes from timestamped events, including transport
  overhead. Usage comes only from provider completion telemetry. Invoice cost is
  not known; any token-rate calculation must be labelled an estimate.

## Editing rule and media

Use the first attempt in each condition for detailed montage even if unsuccessful;
show every repetition in the table. No selection based on the best patch.
Save all original events, commands, exits, source snapshots and diffs.

Video: 1920x1080 MP4, approximately 3–4 minutes, English on-screen captions,
English SRT, locally synthesized Russian narration if usable. This is a clearly
labelled **Replay of recorded runs**, not a continuous screen recording. Waiting
shown at a shortened duration is labelled **Sped up**. No fabricated terminal or
model text. GIF is 28 seconds, with the same factual limits.

The drift scene is a separate copy after the original configuration is frozen:
add an 80-character rule, compile, observe stale exports (exit 1), refresh, and
observe clean exports (exit 0). This does not implement the new rule in code or
reload an already-open agent session.

Inspect beginning/middle/end of both media, check audio/subtitle alignment,
duration, readability, secret exclusion, and links to existing local artifacts.
No push, publication, Release, or upload is authorized.
