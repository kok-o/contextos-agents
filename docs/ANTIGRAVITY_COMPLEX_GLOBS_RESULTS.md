# Antigravity complex glob checks — 27 October 2026

**Historical baseline:** the two missing patterns below were subsequently
addressed in the [bounded adapter implementation](ANTIGRAVITY_BOUNDED_ADAPTER_RESULTS.md).

The adapter fixes passed all 104 inclusion/exclusion conditions for eight
supported test rules in 13 fresh IDE sessions. Two other Windows rules,
`src/api/*.js` and `src/api/**/test*.js`, still missed matching files in IDE
2.5.5. This is a partial result with a reproducible client limitation.

These checks extend the [initial activation and Windows path tests](ANTIGRAVITY_ACTIVATION_RESULTS.md).
They distinguish serialization, matcher semantics and actual instruction delivery.
They do not establish universal glob compatibility.

## Changes and local checks

- Expand nested `{a,b}` alternatives before writing Antigravity's comma-separated
  `globs` field. Its parser splits on every comma, including commas inside braces.
  For example, `**/*.{test,spec}.{js,ts}` becomes four separate patterns.
- Preserve commas inside character classes and escapes while resolving source
  activation. Antigravity cannot represent literal commas in its final field;
  export rejects them before writing, instead of corrupting their scope.
- Add workspace-anchored Windows alternatives for finite components containing
  `?`, positive classes and negated classes, and zero-or-more `**/` branches.
  Single-character wildcards explicitly exclude the Windows separator.
- Keep the recursive `**/*[finite suffix]` conversion. Nested directory and
  extension alternatives combine with it. Literal workspace metacharacters
  remain escaped. Patterns retain their portable expanded forms as well.
- On Windows, guard single-character wildcards in the retained portable forms
  too. Otherwise a global `**/*?.js` or `**/*[!0-9].js` can consume a preceding
  backslash and incorrectly match an empty basename before `.js`.
- Bound expansion to 128 output patterns and a 16,000-byte glob field; malformed
  braces and empty expanded patterns fail with a concrete error.

The [upstream matcher documentation](https://github.com/bmatcuk/doublestar/blob/master/README.md#match)
explains that `Match` uses `/` separators, whereas `PathMatch` or normalization
is needed for Windows. The client's observed absolute-backslash input and
unconditional comma split are documented in the earlier diagnosis.

A Go harness using upstream `doublestar/v4` 4.10.0 compared the serialized field,
including the client's comma splitting, against matching the original source
patterns on relative forward-slash paths. **680/680 comparisons passed**, across
17 source configurations and 40 paths. Cases included nested alternatives,
multiple globstars, multiple paths, `?`, positive/negative classes, direct and
nested matches, wrong extensions, near-match filenames and neighboring folders.
This corroborates the translation for those inputs; it does not replace live tests.
The previous packaged adapter missed 119 of those 680 expected outcomes and
produced ten distinct malformed pattern fragments after client comma splitting.
These are deterministic fixture results, not client reliability percentages.

The final frozen checkout passed **624/624 core tests** on Windows / Node 24.19.0,
including expansion limits, class/escape parsing, refusal before disk mutation,
Windows pattern regressions and the existing adapter/resource/ownership suite.

The final path matrix extends to **946 checks**, across 22 configurations and
43 paths, including `.js` with no stem. Three expected exclusions are explicit
scope assertions: upstream `Match` itself accepts `/` in a negated class, so
its unguarded result is not used as the oracle for those three cases. The other
943 expected outcomes come from matching source patterns on relative paths.
All 946 checks passed with no malformed serialized fragments. This distinction
prevents claiming full raw-library parity for the deliberately tightened cases.

## Live environment and artifact

- Antigravity IDE **2.5.5**, Windows, **Gemini 3.8 Flash High**.
- Existing user profile/global rules, not an isolated profile.
- Local unpublished package `contextos-agents@3.0.0-rc.1`, SHA256
  `127e1f5805558aa9e8d9649bebec4763a3f02f307b20206b4614a7f4f58b46e4`.
- Installed `export.js`, `globs.js` and `shared.js` bytes matched the checkout.
- Full loader restart, fresh chat for each case, editors closed, no rule/skill
  attachments. Random markers were absent from user prompts. Skill descriptions
  discouraged on-demand selection. Each file query prohibited unrelated reads.

Ten test rules were installed together, with independent unseen markers:

| ID | Source glob(s) |
| --- | --- |
| 0 | `src/{api,{lib,ui}}/**/*.{test,spec}.{js,ts}` |
| 1 | `src/api/invoice?.[jt]s` |
| 2 | `src/[al]pi/**/invoice[!0-9].js` |
| 3 | `src/api/**/*.js`, `docs/**/*.md` |
| 4 | `**/src/{api,lib}/**/*.js` |
| 5 | `src/api/*.js` — known Windows depth limitation |
| 6 | `src/api/**/test*.js` — known Windows leaf limitation |
| 7 | `src/api/**/invoice?.[jt]s` |
| 8 | `**/*[!0-9].js` |
| 9 | `**/*?.js` |

## Remaining Windows limits

The adapter does not convert an ordinary directory `*`, a fixed-depth `*.js`,
or a leaf such as `test*.js` into a backslash wildcard. Such a conversion can
match extra directory levels: `src/api/*.js` would incorrectly include
`src/api/deep/invoice.js`, and `test*.js` could include
`test-directory/invoice.js`. A separate matcher reproduction confirms both
false positives. Unsupported patterns retain their original form; this is
not a claim that they activate successfully in this client build.

The general fix belongs at the client's matching boundary: normalize Windows
paths and apply a consistent workspace-relative path contract before matching.
The adapter fixes the equivalent subset without broadening unsupported patterns.
An experimentally validated bounded expansion can also represent these two
patterns without changing directory scope; it is not integrated into the
adapter and has substantial output cost. See [the bounded experiment](ANTIGRAVITY_BOUNDED_GLOBS_EXPERIMENT.md).
Windows roots containing literal commas and classes whose positive range spans
the backslash character also receive no native alternative. Bash numeric ranges,
extglobs and exclusion syntax are not certified by these tests.

## Final live outcomes

| Requested file or task | Expected IDs | Observed IDs | Missing |
| --- | --- | --- | --- |
| `src/api/invoice1.js` | 1, 3, 4, 5, 7, 9 | 1, 3, 4, 7, 9 | 5 |
| `src/api/nested/invoicea.js` | 2, 3, 4, 7, 8, 9 | 2, 3, 4, 7, 8, 9 | None |
| `src/lib/deep/invoice.spec.ts` | 0 | 0 | None |
| `src/api/deep/invoice.test.js` | 0, 3, 4, 8, 9 | 0, 3, 4, 8, 9 | None |
| `src/other/invoice1.js` | 9 | 9 | None |
| `docs/probe-note.md` | 3 | 3 | None |
| `src/api/test-review.js` | 3, 4, 5, 6, 8, 9 | 3, 4, 8, 9 | 5, 6 |
| `src/api/nested/test-review.js` | 3, 4, 6, 8, 9 | 3, 4, 8, 9 | 6 |
| `src/api/invoice12.js` | 3, 4, 5, 9 | 3, 4, 9 | 5 |
| `other/src/lib/deep/thing.js` | 4, 8, 9 | 4, 8, 9 | None |
| `src/xpi/invoicea.js` | 8, 9 | 8, 9 | None |
| `src/api/.js` | 3, 4, 5 | 3, 4 | 5 |
| `What is 7 + 5?` | None | None | None |

All 13 responses completed. For the eight supported rule families (IDs 0–4, 7–9), every expected inclusion and exclusion matched: 104 marker conditions. No unexpected marker appeared. The 6 missing confirmations belong only to the two known unsupported Windows patterns (IDs 5 and 6); their positive cases still failed. This is partial acceptance, not a fully passing ten-rule matrix.

Each condition ran once in a fresh chat; the fixture results do not estimate reliability. Intermediate exploratory sessions used a different package and different markers and are not counted in this final matrix.

After recording the outcomes, the original scoped source was restored and synthetic sources/files were removed with exact-content/path checks. Export and drift check passed; the original invoice and note bytes remained intact. No product commit, push, publication, installed-client patch, MCP/runtime change or catalog expansion was performed.
