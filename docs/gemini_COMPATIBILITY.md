# Codex compatibility through the shared Gemini skill exporter

## Desktop observation (27 October 2026)

**Conclusion: native skill discovery, picker activation, automatic selection,
resource resolution and reference updates were observed in Codex Desktop.**
The chosen desktop matrix from [issue #31](https://github.com/kok-o/contextos-agents/issues/31)
was performed on the published RC, with 25 fresh desktop conversations. Enforced
always/glob activation remains unsupported by this exporter, so overall adapter
compatibility is partial. The observations are separate from the CLI group below
and do not establish IDE-extension, Gemini CLI or Antigravity behavior.

The [desktop evidence index](evidence/2026-10-27-codex-desktop-sol-rc1/README.md)
links its [per-trial table](evidence/2026-10-27-codex-desktop-sol-rc1/trial-table.md),
sanitized transcripts, fixture/export checks and cropped screenshots. Full
original logs/screenshots stayed outside the live test workspaces and repository.

### Desktop environment and input

| Setting | Recorded value |
| --- | --- |
| Visible surface/version | ChatGPT in Codex mode; About says `26.1021.31345`, Powered by Codex & OWL |
| Backend | `0.164.0-alpha.11.1`; conversation originator `Codex Desktop` |
| Model / reasoning | `gpt-6.1-sol` / `high`, verified for all 25 conversations |
| Package / adapter | npm `contextos-agents@3.0.0-rc.1` exactly / `gemini` |
| OS / runtime | Windows NT `10.0.26300.0`, Node `v24.19.0`, npm `11.2.0` |
| Isolation | New auto/always/scoped/resources projects and a no-rule control outside other repositories; different random confirmations from the CLI group |
| Personal configuration | 48 global skills and a memory summary were available; metadata inventory retained; no isolated-profile claim |
| Permissions / trust | Existing full access (`danger-full-access`, approval `never`) retained; no permissions changed for a pass. The human confirmed each fixture's native trust dialog. |
| Invocation configuration | No implicit-invocation override added. Effective automatic selection observed 5/5; the global configuration was not independently enumerated. |
| Restart | None; every trial used a fresh desktop chat. Reference update tested in a new chat within the same running app. |

Prompts were typed and submitted in the visible desktop composer. The first
explicit trial clicked `Compat Auto`; the other four selected the same visible
native candidate with Enter. Each selection produced a native skill chip. The
accepted user message serializes that chip as a link to the exported path; the
client then injects a separate `<skill>` block containing its name, native path
and full body. Those transcript blocks independently establish loading for the
explicit rows. Model statements alone were not treated as loading evidence.

The picker exposes the display name `Compat Auto`, exact description and project
scope. It does not expose an absolute path in the observed view, so the discovery
record's visible path is null. The serialized native mention and injected body
subsequently confirm `.agents/skills/compat-auto/SKILL.md`; neither points to the
source rule or generated mirror. See the
[picker before selection](evidence/2026-10-27-codex-desktop-sol-rc1/auto-picker-discovery.png)
and [selected chip](evidence/2026-10-27-codex-desktop-sol-rc1/explicit-1-picker-selected.png).

The source-free control ran first and returned a naming suggestion without a
fixture marker. Automatic/negative chats had no selected skill chip, editor tab
or attached file. Neither the expected marker, source body, fixture script nor
issue text was supplied in an automatic prompt. Actual read paths were retained;
none of the 25 desktop trials read a source body or obtained a confirmation from
a broad search. Every accepted conversation contains exactly one user turn.

### Desktop observations and denominators

| Case | Discovery | Body loading | Final adherence / expected absence |
| --- | --- | --- | --- |
| Visible picker, before selection | 1/1 name, description and project scope; visible path unavailable | Not tested by discovery | Not tested by discovery |
| Explicit native-picker activation | Candidate selected in each of five fresh chats | 5/5 native body injections; native reads also present | 5/5 exact final confirmations |
| Automatic naming review | Not separately measured per trial | 5/5 exported-body reads, with no mention or native body injection | 5/5 exact final confirmations |
| Arithmetic negative control | Not separately measured | No skill read or body injection observed in 5/5; loading state remains null | 5/5 returned `12` without confirmation |
| Source-free no-rule naming control | No fixture skill exists | No fixture body exists | 1/1 without any fixture marker |
| Automatic resource question | Not separately measured | 1/1 exported body and native sibling reference read | 1/1 correct policy and reference confirmation |
| Explicit resource diagnostic | Native resource candidate selected | 1/1 native body injection and sibling reference read | 1/1 correct policy and reference confirmation |
| Reference update in new desktop chat | Native resource candidate selected again | 1/1 native body injection and regenerated reference read | 1/1 new confirmation; old confirmation absent |

Both resource questions read
`.agents/skills/compat-resources/references/invoice-policy.md`. The response
stated that amounts are summed and then rounded once to two decimal places, and
distinguished this policy from the ordinary invoice code, which only sums.

### Desktop activation-loss and update diagnostics

Each of these diagnostic cells is a separate fresh conversation:

| Source fixture | Arithmetic | Matching API explanation | Documentation-only summary |
| --- | --- | --- | --- |
| `always` | `12`; no confirmation or loading observed | Exported body read; confirmation observed | Only the requested note read; no confirmation |
| `scoped` | `12`; no confirmation or loading observed | Exported body read; confirmation observed | Only the requested note read; no confirmation |

The native projection contains only name/description frontmatter. Successful API
selection is not evidence of enforced glob scoping, and missing arithmetic/doc
confirmations are not failures of a promised always-rule mechanism. Always/glob
enforcement is documented unsupported behavior for RC.1, rather than an adapter
pass manufactured from successful explicit invocation.

After the original 24 desktop conversations, only the resource source
confirmation was changed. The check reported drift / exit 1 while the native
resource retained its old bytes. Regeneration exited 0; the check then passed
with `hasDrift: false`, exit 0. A fresh desktop resource chat, without restarting
the app, read and emitted the new reference confirmation. Exact before/after
bytes, hashes and checks are in
[desktop lifecycle evidence](evidence/2026-10-27-codex-desktop-sol-rc1/lifecycle.json).
This tests reference refresh in a new conversation, not arbitrary skill-body
cache invalidation or persistence across application restarts.

All four final fixture checks passed (two projected outputs per ordinary
fixture, four for resources). Code/docs hashes still match the source-free
control. Some combined read/search commands ended with exit 1 because a final
`rg --files -g AGENTS.md` found no matches. Their output contains the native body
read, and explicit injection is independently recorded; these exits are retained
without treating them as proof that preceding reads failed.

These 25 observations used the existing ChatGPT login. Reported usage was
1,692,343 input tokens (1,387,648 cached) and 5,157 output tokens; monetary cost
is unavailable. No API-key benchmark or credit purchase was made. Small samples,
the shared personal configuration and the earlier uncertain global-hooks trust
state limit generalization. This is a completed observation matrix for the
chosen desktop surface, with documented unsupported semantics, not a reliability
guarantee or stable-release acceptance.

## CLI observation (27 October 2026)

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
The later desktop group above supplies separate UI evidence; it does not change
the meaning or denominators of this earlier CLI group.

### CLI environment and method

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

### CLI observations and denominators

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

### CLI activation loss is documented unsupported behavior

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

### CLI export lifecycle

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

### CLI remaining limits

The run contains 26 completed inference trials, including the flagged extra
attempt, plus one metadata-list observation. Personal memory and other skills
were available; the control itself consulted personal memory. The random
fixture confirmation was not found there, and no source-body read or broad
search exposing a confirmation was observed, but clean-profile behavior was
not measured. Reported token usage is retained; monetary cost is null.

This CLI group did not test desktop/IDE or a visible picker; those desktop
observations are in the separate group above. IDE trials, persistent-client
application-restart behavior and an isolated-profile replication remain
unperformed. The uncertain global-hooks trust state is an environment limitation.
Do not infer an IDE result, promise reliable automatic selection, or approve a
stable release from these observations.
