# Antigravity native skill trials — 26–27 October 2026

This is a partial response to issue #32, based on Antigravity IDE 2.5.5 on
Windows with Gemini 3.8 Flash High. The tested tarball was a local unpublished
`contextos-agents@3.0.0-rc.1` build (SHA256
`5d0736fcfcca5bcfcaae82d18bac07bed39a0d64ac40e5f8e2f2f21af7f46e22`), built
from PR #35 head `bde0f8daa2915656e29bc32b5c5b5710ca41c9f2`. It was not the
published npm RC requested by the issue.

Each counted trial used a fresh conversation with no manually attached files;
explicit cases used the IDE's native skill menu. The existing profile contained
global rules and plugins; it was not isolated. The evidence below consists of
observed UI activity and responses, not an independently exported transcript.

| Case | Observation | Evidence and limitation |
| --- | --- | --- |
| No-rule control | 0/1 confirmations | One naming task in a separate no-rule root. |
| Native discovery | Observed once | `/compat` listed the skill and description; selecting it produced a skill chip. |
| Automatic positive | 5/5 confirmations | Skill-read activity observed; the exported path was independently resolved for one trial. |
| Automatic negative | 0/5 false confirmations | No test-skill read visible in the five arithmetic tasks. |
| Explicit selection | 5/5 confirmations | Native skill selected; one additional history-confounded attempt was excluded. Full read paths were not resolved for every trial. |
| Resource, automatic | 1/1 correct policy and confirmation | Exported resource path was resolved in the IDE. |
| Resource, explicit | 1/1 correct policy and confirmation | Native selection used. |
| Export update | New confirmation observed in both fixtures | Source update caused drift, re-export and check passed; fresh IDE sessions returned the new marker. |

One malformed automatic-positive prompt and one explicit attempt that read a
prior conversation were excluded and replaced. The IDE could access previous
conversations even when a new chat was started; the profile was not isolated.
The separate clean drift roots were not used for lifecycle trials: updates were
performed in the existing trusted fixture roots.

The earlier local build exposed `always` and `globs` as selectable skills without
enforcing their activation: an `always` marker was absent in the documentation
task, and scoped selection followed its description. Later adapter changes and
separate live rule tests are recorded in
[activation results](ANTIGRAVITY_ACTIVATION_RESULTS.md) and
[bounded-glob results](ANTIGRAVITY_BOUNDED_ADAPTER_RESULTS.md). The two builds
must not be combined as if they were a single trial group. These small samples do
not establish model reliability or close the published-RC verification gap.
