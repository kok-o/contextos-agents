# Antigravity bounded glob adapter — 27 October 2026

The `gemini` adapter adds managed native rules for the Windows NTFS patterns
`src/api/*.js` and `src/api/**/test*.js`, without widening their folder scope.
This builds on the [earlier experiment](ANTIGRAVITY_BOUNDED_GLOBS_EXPERIMENT.md).

The original 47-file results below describe the first implementation. The
subsequent compact-export verification is recorded at the end of this document.

The adapter enumerates possible filename lengths and represents each filename
character with a class that excludes Windows `\`. Recursive rules have separate
direct and nested branches. The source patterns remain in the primary rule;
the bounded alternatives are partitioned into additional native rule files.
The implementation covers a fixed literal directory and a filename containing
one ordinary `*`, optionally preceded by `**/`. It does not certify arbitrary
globs, UNC paths, non-NTFS volumes, other clients or other operating systems.

For the two fixture skills the export generated **47 additional rules**,
totalling **732,220 bytes**. Chunk paths use a deterministic hash of the skill
name and a sequence number. Every chunk carries the same instruction body and
relocated resource links, is tracked as `gemini@2`, and participates in the
existing transaction, drift check and pruning. A user-owned file is refused
even if byte-identical; modified chunks, including Git conflict markers, are
preserved during export pruning and uninstall. Explicit force behavior follows
the existing export contract.

The adapter bounds expansion to 2,048 generated patterns and 128 chunk files
per skill. It checks the serialized glob field and entire raw rule file before
writing; a rule exceeding 24,000 bytes fails rather than silently truncating.
Client-side `@[...](...)` includes can expand the final body further and remain
subject to the client's own size limit. A comma in the workspace path cannot
be represented for these patterns and causes an error before mutation.

## Local verification

- Generated patterns matched the independently exercised native prototype
  byte for byte: **253** for `src/api/*.js` and **498** for
  `src/api/**/test*.js`.
- The [matcher experiment](ANTIGRAVITY_BOUNDED_GLOBS_EXPERIMENT.md) checked
  **2,526 inclusion/exclusion outcomes**, covering ASCII filename lengths up
  to the NTFS component limit, nested paths, sibling folders and an emoji.
- Focused tests cover deterministic names, valid rule size, repeat exports,
  byte-identical unowned collisions, modified chunks, prune-on-auto, uninstall
  preservation, expansion caps and refusal before disk mutation.
- The final checkout passed all **627 core tests** on Windows / Node 24.
- A separate child-process test interrupted a transaction while writing a
  chunk, then exercised both `recover --rollback` and `recover --resume`.
  Both preserved the user's source/custom file and finished with a clean export
  check. The same production transaction implementation is used by the adapter.

## Live environment

- Antigravity IDE **2.5.5**, Windows NTFS, Gemini 3.8 Flash High.
- Local unpublished `contextos-agents@3.0.0-rc.1` package SHA256:
  `eb3a9679cad05db50543581e27379e7e3952f927184e9a9bada4f5d0bb4ba335`.
- Installed adapter, compiler, drift, ownership and uninstall modules matched
  the checkout byte for byte. `export gemini --check --json` returned zero
  findings after installation and export.
- Each case used a fresh chat with no rule/skill attachment. Random markers were
  absent from the prompts, and skill descriptions discouraged on-demand selection.

| File requested | `src/api/*.js` | `src/api/**/test*.js` |
| --- | --- | --- |
| `src/api/test-check.js` | observed | observed |
| `src/api/nested/test-check.js` | absent | observed |
| `src/api/test-directory/invoice.js` | absent | absent |
| `src/other/invoice.js` | absent | absent |
| `src/api/` + 180 `z` characters + `.js` | observed | absent |

Each row is one live trial; the observed markers indicate instruction execution
in these sessions, not a general guarantee of model compliance. After testing,
the synthetic inputs were removed, the managed chunks were pruned, and export
check returned zero findings. The original fixture files retained their exact
bytes. Linux, macOS, Node 22 and UNC paths have not been verified for this final
change. The package used here is local and has not been published.

## Compact export verification

The chunk glob-field budget was raised from 16,000 to 23,000 serialized bytes;
the 24,000-byte limit for each complete raw rule remains enforced. For the same
two fixture skills this produced **33 additional rules**, 727,083 bytes total,
with the largest at 23,362 bytes. Actual counts depend on the workspace path,
pattern and instruction body. Includes expanded by the client may increase size.

The unpublished package used for this run had SHA256
`b5262964c3a72a7ed5385d285e7a926ee5e5f60a111bf61a23b6d354dff04c4e`.
In Antigravity IDE 2.5.5 on Windows/NTFS, five fresh sessions reproduced the
same observed marker outcomes as the table above. The long filename matched a
rule of 22,703 bytes, demonstrating one activation above the old budget. These
are individual trials, not a statistical reliability or performance result.

The 34 focused adapter, ownership and uninstall tests passed. After the live
trials, synthetic inputs and generated chunks were removed, export check passed,
and the original fixture files were confirmed byte-for-byte intact. The earlier
627-test run predates this change; Linux, macOS and Node 22 have not been tested
for the compact version.
