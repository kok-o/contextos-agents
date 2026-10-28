# Core 3.0.0 prepublication verification

> Historical snapshot: packaged files and release workflows have since changed.
> The archive and results below do not identify the current candidate. See
> [RELEASE_PROCESS](RELEASE_PROCESS.md) and rerun acceptance for new bytes.

Date: 28 October 2026. Status: the local archive passed the package checks below;
stable publication is not yet configured. Nothing was committed, pushed, tagged,
released, or published during this verification.

## Reviewed artifact and source scope

| Property | Value |
| --- | --- |
| Archive | `contextos-agents-3.0.0.tgz` |
| SHA-256 | `ece91ce6f765ef1a858b85da3af83e1f2228755789518d3b46b6ed6f4ed4ad9a` |
| Entries / unpacked bytes | 337 / 1,341,674 |
| Base revision | `c9f470fb868339b4201e7ded91c567f1da55b020`, plus the existing uncommitted rule changes and packaging fixes |
| Package boundary | Core only; MCP is excluded |

The archive was built from a separate local validation copy with version
`3.0.0` and `publishConfig.tag: latest`. The main checkout remains
`3.0.0-rc.1` / `next`. The validation copy also updates the matching lockfile,
gate version examples, and draft release instructions. This is not a published
3.0.0 or a verified clean Git commit.

Only `package.json` and `README.md` differ between this archive and the freshly
packed RC working-tree archive. The other 335 packaged files are byte-identical.
An independent repack of the validation copy reproduced the same archive SHA-256.
The 42 pre-existing changed/untracked paths were checked against their initial
hashes and existence: none was changed by this verification. In particular, the
existing deletion of `.agents/plugins/contextos/hooks.json` was preserved.

## Packaging problems found and fixed

- The two reviewed instruction-baseline/scenario JSON files were missing from
  the Git release-surface allowlist. Only those exact paths were added; neighboring
  raw evidence and their npm inclusion remain rejected.
- The broad plugin-directory npm selection included an old ignored
  `hooks.json.bak`. Selection now includes plugin JSON files without the backup.
  The backup itself was preserved. An actual npm pack regression checks this
  boundary and retains both ordinary plugin and hook JSON files when present.
- That new test's initial npm locator assumed the Windows layout. Linux caught
  the error; the locator now also supports the standard Unix npm layout.

The initial release-surface check failed on these concrete inputs. The corrected
check passed, with no violations and 337 archive entries. Runtime, adapters, and
MCP implementation were not changed by these fixes.

## Package verification

| Check | Result and scope |
| --- | --- |
| Full root suite, Windows / Node 24.19.0 | 678 passed; before the subsequent test-only Unix npm-locator correction |
| Core suite, validation copy / Windows / Node 22.23.4 | 633 passed, 0 failed; includes the corrected test |
| Final targeted release-surface tests, Windows / Node 24 | 9 passed after the locator correction |
| Publisher and release-surface tests, validation copy / Linux / Node 22.23.4 | 25 passed after the locator correction |
| Publisher and release-surface tests, validation copy / Windows / Node 24 | 25 passed; the subsequent locator change was tested by the final targeted Windows and Linux runs |
| Production-only installation, Windows / Node 24.19.0 | Passed against the exact 3.0.0 archive; 37 recovery checks passed |
| Production-only installation, Windows / Node 22.23.4 | Passed against the same archive; 37 recovery checks passed |
| Production-only installation, Linux / Node 22.23.4 | Passed against the same archive; 37 recovery checks passed |
| Skill examples | 68 passed in their declared scopes |
| Build, skill validation, catalog validation | Passed; seven core skills, zero validation errors/warnings |
| Export check | Passed; 131 projections, no drift |
| Secret scan | Passed over tracked and non-ignored untracked files |
| Markdown and whitespace | Checked again after this report and compatibility updates |

The recovery and repeated release tests overlap existing tests; their counts
must not be added to 678 as additional unique tests. Linux used the pinned Docker
image `node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`.
The Windows Node 22 runtime was downloaded from nodejs.org and checked against
its official SHA-256 list. macOS was not freshly tested in this run.

Installation acceptance covers production-only CLI usage, CLI wrappers,
init, skill add/override, compile/export/check/update/resolve, custom entrypoints,
manifestless routing, crash recovery, uninstall, and preservation of user rules.
The core installed-package scenarios separately exercise strict doctor in CJS
and ESM consumers, including rejection of broken evidence.

| Upgrade / checkpoint rollback | Platform and runtime | Result | Configuration files restored byte-for-byte |
| --- | --- | --- | --- |
| 2.2.0 → 3.0.0 → 2.2.0 | Windows / Node 24.19.0 | Passed | 325 |
| 2.3.1 → 3.0.0 → 2.3.1 | Windows / Node 24.19.0 | Passed | 424 |
| 2.3.2 → 3.0.0 → 2.3.2 | Windows / Node 24.19.0 | Passed | 425 |
| 2.3.2 → 3.0.0 → 2.3.2 | Linux / Node 22.23.4 | Passed | 425 |

## Legacy Gemini CLI

Gemini CLI 0.65.0 was installed locally for this test. Its real `skills list`
command found the two exported workspace skills at their native `.agents/skills`
paths after the controlled test workspace was trusted.

Personal Google OAuth completed in the browser, but inference initialization
failed with `IneligibleTierError` / `UNSUPPORTED_CLIENT`. This is consistent with
[Google's documented consumer-account deprecation](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals):
Google AI Pro/Ultra and free individual accounts stopped being served by legacy
Gemini CLI on 18 June 2026. API-key and enterprise access were not tested.

Consequently, legacy Gemini CLI has discovery evidence, but no new model-adherence
pass from this run. It must not inherit the successor client's results.

## Antigravity CLI through the subscription

Client: Antigravity CLI 1.4.8, verified official-download SHA-512. Model:
`gemini-3.8-flash-medium`. The native UI identified Google AI Pro. No API key or
API billing configuration was used. Default request-review permissions were
retained; no blanket tool auto-approval was added.

The first condition inherited the personal global configuration. A source-free
arithmetic calibration passed, as did five arithmetic controls. Two automatic
naming trials selected the correct native skill path, but its read failed before
execution: the existing Google telemetry plugin's PreToolUse hook misparsed a
quoted Windows script path. Two further in-flight trials were interrupted when
this cause was identified. These attempts and their partial traces were retained,
not counted as successful reads or silently replaced.

A separate client data root was then used through the client's accepted
`--gemini_dir` option. It contained no copied global plugins, hooks, or configured
MCP servers. Normal first-run setup and trust were completed for the controlled
fixtures. The Windows secure keyring and subscription account were shared;
this is not OS-level isolation. The original global telemetry hook was not edited.

The second condition was fixed at eight requests before running it. Canonical
sources and generated mirrors were outside the active fixture directories during
inference. Expected random confirmations were not included in task prompts.

| Separate-profile case | Observed result |
| --- | --- |
| Arithmetic negative control | 1/1 returned `12`, with no tool call or skill confirmation |
| Automatic naming review | 2/2 successful reads of native `SKILL.md`; 2/2 expected final confirmations |
| Explicit native slash invocation | 2/2 expected final confirmations; ordinary source-file reads succeeded |
| Automatic resource selection | 1/1 native body and sibling reference reads; correct policy and confirmation |
| Explicit resource invocation | 1/1 sibling reference read; correct policy and confirmation |
| Resource update, fresh session | 1/1 read the regenerated native reference and returned the new confirmation; old confirmation absent |

Explicit slash expansion was exercised without supplying the skill body or random
confirmation in the caller's prompt. Its body injection is not separately exposed
in the captured event stream; do not describe it as an observed `read_file` of
`SKILL.md`. Automatic body reads are exposed with state `DONE` and native paths.

The resource update first produced drift / exit 1 while native bytes stayed old,
then regeneration and a clean check / exit 0. A fresh headless session read the
new reference. This does not test an IDE restart or arbitrary persistent caches.

All eight separate-profile runs completed successfully and matched their
criteria. Their completed tool calls were only file reads; no shell or MCP call
was made. Protected fixture source files and native skill bodies kept their hashes.
Provider-reported totals for this group were 132,148 input tokens and 6,663 output
tokens, including 4,243 reported thinking tokens; total tokens 138,811. Monetary
cost is unavailable. Counts from the interrupted personal-profile condition are
separate, and this small sample is not a reliability guarantee.

These are client delivery and adherence observations, not an old/new comparison
of `gemini-precision` or a run of the eight prepared instruction-behavior scenarios.
Always/glob activation was not tested in this CLI group.

## Remaining stable-release preparation

The archive passed the checks above. A stable publication is still a separate
operation and requires reviewing/promoting the 3.0.0 metadata from the validation
copy into the source tree and binding the chosen final archive to release evidence.
Changing packaged bytes requires a new archive hash and corresponding acceptance.

The existing stable workflow and `packages()` publisher select both core and MCP.
There is no core-only stable mode, and the validation copy has no
`docs/evidence/release-3.0.0.json` identity for that paired publisher. Do not trigger
that workflow expecting a core-only release. Prepare the intended core-only stable
publication path before publishing; the existing RC-only path is not suitable for
an immutable version already published as RC.1.

This run made no registry mutation, GitHub release, commit, or push. The original
global client plugins and hooks were not manually edited or disabled. Local archives, profiles, protocols,
raw traces, hashes, and machine-readable summaries remain under the ignored
`scratch/preflight-2026-10-28/` directory; raw account/session data was not added
to public evidence or the npm archive.
