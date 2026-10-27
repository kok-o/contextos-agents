# Codex Sol RC.1 evidence — 27 October 2026

The [compatibility report](../../gemini_COMPATIBILITY.md) records a partial
Codex CLI result for [issue #31](https://github.com/kok-o/contextos-agents/issues/31).
Desktop, IDE, visible picker selection and enforced always/glob activation were
not verified. No release was published.

## Contents

| Artifact | Contents |
| --- | --- |
| [trial-table.md](trial-table.md) | One row per completed inference attempt, including the extra confounded automatic attempt |
| [trials.json](trials.json) | 26 exact prompts, sanitized verbatim final responses, commentary, command traces, body/reference output, loading observations, usage and original-log hashes |
| [discovery.json](discovery.json) | One native `skills/list` observation without inference; correct exported metadata/path, no picker UI claim |
| [fixtures.json](fixtures.json) | Four exact installed versions and npm integrity values, initial drift checks, fixture paths/bytes/hashes |
| [final-checks.json](final-checks.json) | Final clean checks from each actual fixture directory; two projected outputs per ordinary fixture and four for resources |
| [control.json](control.json) | Source-free control inventory, ordinary file bytes/hashes and ancestor instruction checks |
| [lifecycle.json](lifecycle.json) | Source-reference update, old/new native resource bytes/hashes and exact export/check output |
| [environment.json](environment.json) | Executable, surface/version, model, settings, trust limitations, aggregate usage and sanitization policy |
| [skill-inventory.json](skill-inventory.json) | Native-discovered skill names, scopes, enabled flags and plugin IDs in the non-isolated profile |
| [failed-attempts.json](failed-attempts.json) | Three earlier Terra failures and the old CLI's Sol failure, all before a model response |
| [model-availability.json](model-availability.json) | Native model-list results showing the two installed clients' different available model IDs |
| [fixture.cjs](fixture.cjs) | External setup script from the issue; generates fresh random confirmations |

There are five explicit mention trials, six automatic positive attempts, five
arithmetic negative trials, one source-free control, two resource trials, six
activation-loss diagnostics and one lifecycle trial. Automatic attempt 4 is
flagged because a later broad search encountered source metadata; five other
automatic attempts form the uncontaminated subset. All attempts are retained.

Loading and adherence are counted separately. An unobserved read is null, not a
proven absence. The native list is metadata evidence only. It is not counted as
an inference trial or evidence of body loading.

## Reproduction

Use Node 22+ and existing client access. Create four separate disposable
projects outside this repository, save `fixture.cjs` outside those projects,
and run the issue's setup commands in each project, one at a time:

```powershell
git init
npm init -y
npm install --save-dev --save-exact contextos-agents@3.0.0-rc.1
npx --no-install contextos init --skip-compile
node 'C:\outside\fixture.cjs' auto
npx --no-install contextos compile
npx --no-install contextos export gemini
npx --no-install contextos export gemini --check --json
```

Replace `auto` with `always`, `scoped` or `resources` for the other projects.
Keep the script's confirmation output outside the client conversation. Create a
separate control with only Git and the same ordinary `src`/`docs` files, with no
rule directories or root instructions.

Record the exact installed CLI executable and its version; the `codex` first on
PATH in this run was the older client. With the already installed
`0.164.0-alpha.11.1` executable selected, each successful inference used:

```powershell
$trialPrompt = 'What is 7 + 5?'
'' | & $codexExecutable exec --model gpt-6.1-sol --ephemeral --json -C $fixturePath $trialPrompt
```

Use the exact prompts from `trials.json`, never its expected confirmation or
response as input. For explicit mention rows, the `$compat-auto` or
`$compat-resources` prefix is a literal part of the prompt. No picker UI was
automated successfully. This group uses Sol because the user explicitly
authorized that model after the earlier errors; do not silently substitute a
model or client version when reproducing it.

Fresh processes were used, with no resume/fork. The sequential repeated group
overlapped with the independent diagnostic group; no fixture was changed during
those groups. After all original and additional trials, only the resources
source reference's confirmation was changed, then drift/export/check and a new
explicit session were run.

## Evidence boundaries

`fixtures.json` captures file bytes after the lifecycle diagnostic. Its resource
reference therefore contains the new confirmation; `lifecycle.json` preserves
both original and updated bytes, and original trial tool output preserves the
old reference. Initial clean drift checks are explicitly labeled as initial.

Published paths replace the user's profile and disposable root with placeholders.
Prompt wording and response wording are otherwise unchanged. Reasoning summaries
and unrelated tool outputs, including personal-memory contents, were omitted.
All completed command strings remain; relevant exported body/reference output
and the flagged source-search output are preserved. Full original logs remain
outside the repository, identified by SHA-256 hashes in `trials.json`.

The old client's four model errors are not activation failures and do not enter
the success denominators. One alpha startup attempt was terminated before it
emitted events; its inference occurrence and usage are unknown. It was retried
with an explicitly closed stdin, and the completed retry is the source-free
control. No unavailable observation was converted into a pass.

The profile retained personal skills/plugins/memory. The auto fixture was marked
trusted during the earlier interactive attempt; the global-hooks trust dialog
outcome remains uncertain. No sandbox or approval flag was changed to obtain
these observations. Aggregate CLI usage was 1,730,968 input tokens, including
1,400,064 cached input tokens, and 12,490 output tokens; reasoning tokens are a
subset of output. Monetary cost is unavailable under the existing ChatGPT login.
