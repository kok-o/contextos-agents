# Team workflow: branches, merges and CI

ContextOS exists for the situation where more than one person (or branch) changes
the rules that coding agents read. This page describes what to commit, what git
does with generated files, and how to recover when it objects. Every statement
here is exercised by an installed-package test in
[`tests/scenarios.test.js`](../tests/scenarios.test.js).

## What to commit

| Commit | Do not commit |
| --- | --- |
| Rule sources: `.agents/project/skills/**` | `.agents/compiled/` (a derived cache) |
| Generated agent files (`.claude/`, `.cursor/rules/`, `.agents/skills/`, `.github/copilot-instructions.md`, `CONVENTIONS.md`, `.zed/`) | `.agents/.contextos/` (transaction journals) |
| `.agents/lockfile.v2.json` | |
| `package.json` and your package lockfile, with `contextos-agents` pinned | |

`npx --no-install contextos init` adds the two ignored paths to your `.gitignore` in a
marked block. Generated files are committed on purpose: CI compares them with
what the sources render, and agents read them straight from the checkout.

## The pull request loop

1. Edit a rule under `.agents/project/skills/`.
2. `npx --no-install contextos compile && npx --no-install contextos export all`
3. Commit the source, the generated files and the lockfile together.
4. CI runs `export all --check` (the [gate action](../GUIDE.md#ci-configuration-check)).
   Exit code `0` means the committed files match the sources, `1` means drift,
   `2` means the check could not run (for example the lockfile holds merge
   conflict markers).

The check renders from the sources every time; it does not trust a cache, so a
forgotten `compile` or a forgotten `export` is caught.

## Merging branches

The lockfile and the generated files carry nothing that changes on every edit:
no source hash in file headers, no revision counter, no timestamps, and the
lockfile is sorted by path. That keeps merges quiet:

- Two branches that **edit different rules**, or add rules that are not
  alphabetical neighbours, merge without a conflict.
- Two branches that **add neighbouring rules** can conflict in files that list
  every rule: `CONVENTIONS.md`, `.zed/rules.md`, `.github/copilot-instructions.md`
  and `.agents/lockfile.v2.json`. These are derived files. Rule sources under
  `.agents/project/` never conflict because of this.
- Two branches that edit **the same lines of the same rule** conflict in the
  source. That is a real disagreement; resolve it as you would any other text.

After resolving source conflicts, take any version of the derived files (or
leave the conflict markers) and run:

```sh
npx --no-install contextos export all
git add -A
```

`export` rebuilds every generated file from the sources, even those that still
contain conflict markers, and rebuilds a conflicted lockfile from both sides.
Two cases need you:

- A conflict **outside** the managed block of a file that also holds your text
  (for example your own lines in `.github/copilot-instructions.md`) is yours to
  resolve; `export` stops and says so rather than guessing.
- A conflict hunk that spans both your text and the managed block also needs
  manual resolution. Recovering the lockfile does not authorize replacing an
  edited generated file; restore it yourself or explicitly use `--force`.
- A file at a generated path that ContextOS never wrote is not replaced.
  `export all --force` replaces it explicitly.

While markers are present, `export all --check` reports `"status": "error"`
(exit code `2`) instead of a false pass.

## Line endings

Generated files are written with LF endings regardless of the endings in the
checkout the sources were read from, and the check treats CRLF and LF as the
same text. A Windows checkout with `core.autocrlf=true` therefore passes the
check and a later `export all` leaves a clean working tree untouched. A
`.gitattributes` line such as `* text=auto eol=lf` keeps everyone consistent.

## Files that already exist

| File | Behavior |
| --- | --- |
| `CLAUDE.md` | Not touched. Claude Code reads `.claude/rules/` and `.claude/skills/`. A block written by an earlier ContextOS version is removed on the next export; your text stays. |
| `.github/copilot-instructions.md` | Your text stays; ContextOS owns only the block between its markers. Editing your own lines never causes drift. |
| `CONVENTIONS.md`, `.aider.conf.yml` | `CONVENTIONS.md` is refused unless ContextOS wrote it. Existing `.aider.conf.yml` settings are merged and kept. |
| `.cursor/rules/<your own>.mdc` | Never touched; only files ContextOS wrote are replaced. |

`uninstall` keeps merged `.aider.conf.yml` settings in full. Remove obsolete
`CONVENTIONS.md` references from that file manually after uninstalling.

## Versions

Pin `contextos-agents` as a development dependency. A newer version can render
different files from the same sources; upgrade it in its own commit and
re-export. Developers on different versions will see each other's exports as
drift, which is the signal to align them.
