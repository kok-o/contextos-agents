# Codex compatibility through the shared Gemini skill exporter

## Observation: 27 October 2026

**Conclusion: partial compatibility observed in Codex CLI only.** Published
`contextos-agents@3.0.0-rc.1` exported a skill that Codex discovered, read and
followed in the recorded explicit and automatic naming-review trials. Exported
sibling references and a regenerated reference were also read successfully.
These observations do not establish enforced `always` or `globs` activation,
reliability beyond this small sample, or desktop, IDE, Gemini CLI or Antigravity
behavior.

This report follows [issue #31](https://github.com/kok-o/contextos-agents/issues/31).
The [evidence index](evidence/2026-10-27-codex-sol-rc1/README.md) links the
[per-trial table](evidence/2026-10-27-codex-sol-rc1/trial-table.md), sanitized
verbatim prompts/responses, loading commands, fixture bytes and export checks.
The issue remains open for maintainer review of the surface and UI limitations.

## Environment and method

| Setting | Recorded value |
| --- | --- |
| Surface | Codex CLI; independent `exec --ephemeral --json` process per inference trial |
| Client version | `0.164.0-alpha.11.1`, already installed; exact executable recorded in sanitized form in evidence |
| Model / reasoning | `gpt-6.1-sol` / `ultra`; the user authorized Sol after the earlier blocked attempts |
| Authentication / usage | Existing ChatGPT login; no API-key benchmark or credit purchase; monetary cost unavailable |
| OS / runtime | Windows NT `10.0.26300.0`, Node `v24.19.0`, npm `11.2.0`, Git `2.51.0.windows.2` |
| Package / adapter | Exact npm `3.0.0-rc.1` / `gemini`; no catalog skills and no `--with-core` |
| Isolation | Four separate disposable Git/npm projects and one source-free no-rule control outside other repositories |
| Personal configuration | Inherited skills, plugins and memory; not an isolated profile. Inventory retained in evidence. Implicit-invocation configuration was not independently established. |
| Permissions / trust | No sandbox or approval override. The disposable auto project was trusted during an interactive discovery attempt; other project trust was not established. The earlier global-hooks trust dialog outcome is uncertain. |
| Restart / discovery | Each inference used a new process; native `skills/list` used `forceReload: true`. No persistent-client cache claim. |

The successful group explicitly selected Sol with `--model gpt-6.1-sol`; the
underlying global config still named Terra. CLI `0.149.1` rejected both Terra
and Sol with `model_not_found`. The newer installed CLI advertised Sol in its
native model list and completed the control. These versions and attempts are
separate groups; their failures are retained in evidence.

No expected marker, rule body, fixture script or issue text was included in an
automatic-selection prompt. Expected values and logs stayed outside the live
test projects. The no-rule control ran before the successful rule trials and
returned a naming suggestion without any fixture marker. Ordinary code/docs
were identical across fixtures. No parent `AGENTS.md` was found during setup.
Source rules remained present, so actual read paths and broad searches were
reviewed rather than assuming all confirmations came from the exporter.

Explicit trials supplied the native `$compat-auto` mention followed by the exact
review prompt as the CLI prompt argument. This tests textual mention behavior
in `codex exec`; it does not test selecting a skill in a GUI picker. Discovery
used the CLI app-server's native `skills/list` API without an inference request.
An earlier interactive terminal attempt did not produce a usable picker view.
See OpenAI's [skill testing guidance](https://developers.openai.com/blog/eval-skills)
for scripted CLI trials and [skill documentation](https://learn.chatgpt.com/docs/build-skills)
for discovery/invocation context.

## Observations and denominators

“Body read” below means a completed tool read of the exported native path with
the actual body in its output. Statements by the model that it used a skill were
not counted as independent loading evidence. An absent tool read does not prove
that a native injection was absent; unavailable loading observations stay null.

| Case | Discovery | Exported body read | Final confirmation / expected absence |
| --- | --- | --- | --- |
| Native metadata list | 1/1; correct name, description and `.agents/skills/compat-auto/SKILL.md` path | Not tested by list | Not tested by list |
| Explicit `$compat-auto` mention | Not separately measured per trial | 5/5 | 5/5 exact confirmation lines |
| Automatic naming review, uncontaminated subset | Not separately measured per trial | 5/5 | 5/5 exact confirmation lines |
| Additional naming-review attempt with broad source search | Not separately measured | 1/1, before the search | 1/1; retained separately |
| Arithmetic negative control | Not separately measured | 0/5 observed reads; native injection unknown | 5/5 returned `12` without confirmation |
| Source-free no-rule naming control | Not separately measured | No fixture body exists | 1/1 without any fixture marker |
| Automatic rounding-policy question | Not separately measured | 1/1 plus native sibling reference | 1/1 policy and reference confirmation |
| Explicit `$compat-resources` diagnostic | Not separately measured | 1/1 plus native sibling reference | 1/1 policy and reference confirmation |
| Reference update, new explicit session | Not separately measured | 1/1 plus regenerated native sibling reference | 1/1 new confirmation; old confirmation absent |

All six automatic naming-review attempts are retained. In `positive-4`, a broad
hidden-file content search encountered source-rule metadata after the exported
body had already been read. Its search output contained no confirmation value.
It is nevertheless flagged as confounded and excluded from the five-trial
uncontaminated subset (trials 1, 2, 3, 5 and 6). This is an additional recorded
attempt, not an erased failure or a changed configuration.

The rounding policy came from
`.agents/skills/compat-resources/references/invoice-policy.md`: sum the line
amounts and round once to two decimal places. Both resource trials also noted
that the ordinary invoice code only sums and does not itself implement rounding.
They read the exported sibling, not the source reference or generated mirror.

## Activation loss is documented unsupported behavior

In this package's shared native-skills projection, frontmatter contains only
`name` and `description`. ContextOS `activation: always` and `globs` are not
preserved as native enforcement. No root `AGENTS.md` is generated. Every fixture
is available as an agent-selected skill.

| Source fixture | Arithmetic | Matching API explanation | Documentation-only summary |
| --- | --- | --- | --- |
| `always` | `12`; no confirmation or body read observed | Exported body read; confirmation observed | Only the requested note read; no confirmation |
| `scoped` | `12`; no confirmation or body read observed | Exported body read; confirmation observed | Only the requested note read; no confirmation |

Each cell is one fresh trial. The matching API observations are skill selections,
not proof of glob enforcement. The `always` arithmetic/doc observations must not
be graded as failures of a promised always-rule mechanism. Enforced always/glob
activation is **unsupported by this RC exporter**; these semantics need a
separate native contract before they can be claimed. This documented limitation
is the follow-up record for these diagnostics; no adapter change is included.

## Export lifecycle

After the original group, only the source resource's random confirmation was
changed. The native resource retained its old bytes until regeneration.

1. The original `export gemini --check --json` passed with exit 0.
2. After the source edit, the check reported drift with exit 1.
3. `export gemini` completed with exit 0.
4. The check passed with `hasDrift: false`, exit 0.
5. A fresh explicit resource session read the regenerated native reference and
   emitted the new confirmation, with the old confirmation absent.

Exact check output, paths, before/after reference bytes and hashes are in
[lifecycle.json](evidence/2026-10-27-codex-sol-rc1/lifecycle.json). This is an
update diagnostic for new CLI sessions, not a persistent desktop-cache test.

## Remaining limits

The run contains 26 completed inference trials, including the flagged extra
attempt, plus one metadata-list observation. Personal memory and other skills
were available; the control itself consulted personal memory. The random
fixture confirmation was not found there, and no source-body read or broad
search exposing a confirmation was observed, but clean-profile behavior was
not measured. Reported token usage is retained; monetary cost is null.

Desktop and IDE trials, a visible native picker selection, persistent-client
restart/cache behavior, and an isolated-profile replication remain unperformed.
The uncertain global-hooks trust state is an environment limitation. Do not use
this report to infer a result for those surfaces, promise reliable automatic
selection, or approve a stable release.
