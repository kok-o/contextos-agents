# Antigravity activation observations — 27 October 2026

The adapter preserves activation in Antigravity's native rule format. The
initial path-glob failure and the subsequent Windows compatibility fix are
recorded separately below. These checks are not full client acceptance.

Subsequent complex-pattern fixes and their separate acceptance limits are in
[the complex glob results](ANTIGRAVITY_COMPLEX_GLOBS_RESULTS.md).

## Environment and initial artifact

- Surface: **Antigravity IDE 2.5.5**, Windows; **Gemini 3.8 Flash High**.
- Existing user profile with global rules; not an isolated profile.
- Local `contextos-agents@3.0.0-rc.1` tarball, not the published npm RC.
- SHA256: `dc1a932a054d93a14978813f2f91d1ee0c80c476acc7f5f3aac33cd6ced744eb`.
- Source base: `bde0f8daa2915656e29bc32b5c5b5710ca41c9f2` plus the local adapter
  and watcher changes. Installed adapter bytes matched the checkout.
- Local Node **24.19.0**: **615/615 core tests** passed. Regression coverage
  includes manifest precedence, valid YAML glob values, resources, ownership
  conflicts, activation transitions, pruning and watcher output exclusion.

Package hashes distinguish this build from both the published RC and earlier
test tarballs with the same package version. No new publication was performed.

## Export contract

The [official Antigravity rules format](https://antigravity.google/docs/rules/)
uses `trigger: always_on` or `trigger: glob` with `globs`. `export gemini` now
emits these files at `.agents/rules/contextos-<skill>.md` for the corresponding
activation modes. `auto` emits no additional native rule. The shared native
skills and declared resources remain under `.agents/skills/`.

Native rules retain their instruction bodies and have resource links relocated
to exported resources. They share `gemini@2` ownership, transactions and drift
checks. User-owned files and modified generated rules refuse replacement;
transitioning to `auto` prunes only an unchanged managed rule. The internal
`rule-catalog.js` is not an output target. Watch ignores the derived rules tree.

## Live method

Each counted case used a fresh chat, with editors closed and no rule/skill file
manually attached. Markers were random and absent from the user prompts.
The test skill description explicitly discouraged on-demand selection:
`Activation delivery probe. Do not select this as an on-demand skill.`
This helps distinguish native rule activation from the earlier description-led
skill selection observations. The IDE's Customizations panel discovered the
generated file and recognized its Glob mode. Discovery alone is not delivery.

Final checks followed a full language-server/window restart. The scoped
fixture's invoice and notes were also tested as tracked files with a Git HEAD,
to exclude the original empty-repository setup as the sole cause of failure.

## Initial observations, before the Windows path fix

| Activation and case | Expected marker | Observed |
| --- | --- | --- |
| `always`, arithmetic | Present | Present |
| `always`, invoice explanation | Present | Present |
| `always`, Markdown summary | Present | Present; baseline had omitted it |
| `globs: **/*.js`, invoice explanation | Present | Present |
| `globs: **/*.js`, arithmetic | Absent | Absent |
| `globs: **/*.js`, Markdown summary | Absent | Absent |
| `globs: src/api/**/*.js`, invoice explanation | Present | **Absent**, also after restart and Git fixture indexing |

These are one case per condition, not five repeats or a reliability estimate.
Earlier `always` cases with a different marker also returned it for all three
task types. Additional diagnostics tried matching edits, an open editor,
native file attachment, exact/absolute patterns and a directory-scoped rule;
none established the original path-glob behavior. The diagnostic edit was
reverted, and temporary probe files were removed with containment/content checks.

An eight-pattern diagnostic returned confirmation for the broad/filename
patterns but not the path-bearing patterns. One probe file was explicitly
read by the model, so that probe's confirmation is not independent activation
evidence. The separate `**/*.js` positive case above avoids that ambiguity.
The result suggests a client matching limitation; it does not prove the
implementation or behavior of other versions, platforms or models.

## Reproduction prompts

Arithmetic:

```text
What is 7 + 5?
```

Matching file:

```text
Read src/api/invoice.js and explain totalInvoice. Do not change files.
```

Nonmatching file:

```text
Read docs/note.md and summarize it. Do not inspect other files or change anything.
```

Keep the expected marker out of prompts and old conversation context. Run
`export gemini --check --json` before testing and record both generated
frontmatter and actual client behavior. Do not replace a restrictive path glob
with a broader extension glob to manufacture a passing result.

## Windows path diagnosis and compatibility fix

Static inspection of the installed IDE 2.5.5 language server identified two
different path conventions at the rule trigger boundary:

- `handlers.getTriggeredMemories` calls `doublestar.Match` on
  `fs.Path.DisplayString`, and separately on a name obtained by splitting at `/`.
- `local.(*FS).DisplayPath` obtains an absolute path and replaces `/` with `\`
  on Windows. The trigger handler does not normalize that value back to `/`
  or make it relative to the workspace before matching.
- The [matcher documentation](https://github.com/bmatcuk/doublestar/blob/master/README.md#match)
  says `Match` uses `/` as its separator; Windows paths require `PathMatch` or
  `filepath.ToSlash`. Therefore a relative forward-slash directory pattern
  fails against this absolute Windows display path. A filename-only pattern
  can still match because `\` is not treated as a path separator by `Match`.

The inspected executable SHA256 was
`2f44b0a25eb4630afc1a2817363ef453d51a72c94bbdaa6aad8ba00e8d7aa0e1`.
No installed client binaries were modified. A diagnostic rule containing an
escaped absolute Windows pattern produced its unseen marker; the corresponding
relative forward-slash pattern did not.

For a fixed directory followed by `**/*` or `**/*.suffix`, the adapter now
retains the original glob and adds an equivalent Windows-native pattern
anchored to the exporting workspace. For example, `src/api/**/*.js` also gets
an escaped absolute `...\src\api\*.js` pattern. With this client's matcher,
the final `*` consumes backslashes too, retaining recursive matching inside
that exact directory. The drive letter accepts either case, and literal glob
metacharacters in the workspace path are escaped.

The first implementation of this conversion was limited to that subset. Fixed-depth
patterns (`src/api/*.js`), wildcard directory prefixes, complex leaves and
workspaces containing commas are preserved without a native alternative.
Blindly converting their separators could broaden their scope. No cross-client
or POSIX compatibility claim follows from this Windows workaround. Re-export
after moving a workspace, as the added pattern contains its absolute location.

A scratch Go harness using upstream `doublestar/v4` 4.10.0 checked nine paths:
direct and nested matches, both drive cases, a sibling directory, Markdown,
a similar directory name, a different workspace and escaped literal brackets.
All expected matches and exclusions passed. This corroborates the matcher
semantics; the live IDE checks remain the acceptance evidence.

## Live verification of the Windows fix

The installed package was rebuilt after the fix, with SHA256
`ddac4a8ced3e53b9feccc203ba0ae3094cbfa0e045bcab41030bdcc06cc69d72`.
Both installed adapter modules matched the checkout. The source still declared
`globs: ["src/api/**/*.js"]`. A new random marker was used, absent from every
test prompt, and the loader was fully restarted. The same IDE version, model
and existing profile were used. No editors, rule attachments or explicit skill
selection were involved.

The frozen code passed **618/618 core tests** on Windows / Node 24.19.0,
including three new Windows pattern regression tests. `git diff --check`
passed. The initial 615-test result above predates the Windows fix.

| Fresh session | Expected marker | Observed |
| --- | --- | --- |
| Read `src/api/invoice.js` | Present | Present |
| Read `src/api/nested/invoice.js` | Present | Present |
| Read `src/other/invoice.js`, identical filename and contents | Absent | Absent |
| Arithmetic, no files | Absent | Absent |

Each condition ran once. The two positive cases establish direct and recursive
delivery for this pattern; the sibling case checks directory scope rather
than merely filtering by extension. This addresses the original Windows
`src/api/**/*.js` reproduction, without certifying all glob syntax or clients.
The fixture source and original pattern were restored, the temporary nested
and sibling files were removed after exact-content checks, and export check
passed with zero findings. No product commit, push or publication was made.
