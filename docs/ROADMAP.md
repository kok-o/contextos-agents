# ContextOS roadmap

Updated 24 October 2026, after an independent audit of core 2.3.2 and the rework
that followed it, now prepared as **3.0.0-rc.1 (unpublished, core only)**.
Candidate instructions are in the [RC checklist](RELEASE_3.0.0-rc.1.md).
Earlier release records are in the
[archive](archive/README.md).

## Done in the rework

- Merge-safe output: no whole-graph hash in headers, a sorted lockfile without a
  revision counter, derived caches out of git, LF output on any checkout, and one
  command (`export all`) that rebuilds files holding conflict markers.
- Claude Code gets its native locations (`.claude/rules`, `.claude/skills`)
  instead of a block of links in `CLAUDE.md`; per-rule `activation` is mapped to
  each client.
- A project receives rules, not the tool: `init` creates `.agents/project/skills`
  and a `.gitignore` block; the bundled core is opt-in; `update` migrates 2.x
  projects.
- Every write goes through the journaled transaction; `uninstall` removes
  generated files and managed blocks, needs `--yes`, and cannot be steered
  outside the project by a junction.
- Installed-package scenarios for branches, merges, CRLF checkouts, user-owned
  files and removal run in CI.

## Next: find out whether anyone needs it

The core is only worth more work if teams outside this repository use it. Run
the [pilot protocol](PILOT_PROTOCOL.md) with three to five teams that have at
least two coding agents and three developers, for three to four weeks, with the
check in their CI. Record: how many times the check caught a real stale file,
false alarms, merge conflicts and how long they took to resolve, and why a team
stopped if it did.

Decision after the pilots: if fewer than two teams are still using it, reduce
the product to the `export --check` idea on top of existing formats (or stop);
if two or more are, spend the next effort on what they report.

## Open verification

Live client behavior has not been verified for the new Claude Code layout or for
Cursor, Copilot, Aider and Zed; see the
[verification record](ADAPTER_COMPATIBILITY.md#verification-record) and its
protocol. Run it before relying on any client.

## Frozen

MCP runtime execution, swarm orchestration, recursive memory, the container
verification sandbox and the labs shell. They stay in the repository, are not
part of the stable contract, and receive security fixes only. The freeze ends
when the pilots show a need that only they could meet.

## Not planned

New adapters, catalog growth, paid benchmarks, rule-catalog enforcement levels,
and any claim of token or cost savings. The recorded
[calibration](BENCHMARK_RESULTS.md) found no quality advantage over a plain
prompt, and no later measurement has changed that.
