# ContextOS security model

ContextOS compiles Markdown rules into the instruction files that coding agents
read, and checks that those files are up to date. It is a configuration tool. It
is **not** a sandbox, not a firewall for model actions, and not a guarantee that
a model follows any rule. This page lists what the tool does guarantee, with the
test that exercises it, and what it does not.

## What it guarantees

| Guarantee | Mechanism | Evidence |
| --- | --- | --- |
| Writes stay inside the project. `export`, `init`, `update` and `uninstall` refuse paths that leave the project root through `..`, UNC or network paths, reserved device names, symlinks or junctions. A refused path aborts before anything is changed. | One write path: the journaled transaction resolves every path through `safe-path`. | `tests/safe-path.test.js`; the junction case in `tests/scenarios.test.js` runs `export`, `update` and `uninstall` against a managed directory that is a junction to an outside folder and checks that nothing outside changes. |
| Files that ContextOS did not write are not overwritten or deleted. Generated files you edited are kept by `uninstall`; a differing file at a generated path stops `export` unless you pass `--force`. | Ownership check against the lockfile (`ownsDiskFile`), shared by export and uninstall. | `tests/scenarios.test.js` ("export refuses…", "uninstall keeps a generated file that you edited"). |
| Your text next to a managed block is preserved. | Marker-delimited block replace/remove; a conflict outside the block stops the export. | `tests/scenarios.test.js`, `tests/adapter-compatibility.test.js`. |
| A multi-file change applies completely or not at all. An interrupted change is listed and rolled back by `contextos recover`. | Journaled transaction with backups and preconditions on the previous file hash. | `tests/journaled-transaction.test.js`, `tests/recovery-cli.test.js`. |
| Two ContextOS processes do not write one project at the same time. | Project mutation lock. | `tests/project-lock.test.js`. |
| Installing a skill does not run code from it. | npm sources are installed into a temporary prefix with `--ignore-scripts`; GitHub sources must be pinned to a 40-character commit unless `--allow-floating` is given; `--checksum` verifies the entrypoint. | `tests/plugin-supply-chain.test.js`, `tests/cli-honesty.test.js`. |
| The CI gate does not execute the pull request's scripts. | The gate runs from the pinned package, in process; it reads rule sources as data. | `tests/consumer-gate.test.js`. |
| `doctor`, `resolve` and `compile` run the installed package, not code found in the project. | They load modules relative to the package. | `tests/consumer-gate.test.js` (a rogue `.agents/ctx.js` is not executed), `tests/cli-honesty.test.js` (doctor). |

To our knowledge ContextOS commands do not execute code that lives in rule
sources or skills; a rule contributes text, plus declared resource files that
are copied unchanged. This was designed for, not independently audited.

## What it does not do

- **It does not constrain the model.** Instruction files are context. Claude
  Code's documentation says plainly that its memory files are "context, not
  enforced configuration" ([source](https://code.claude.com/docs/en/memory#claude-md-vs-auto-memory)),
  and the same holds for every client. To block an action, use the client's
  enforcement features (permissions, hooks) or a runtime action firewall.
- **It does not sandbox anything.** The experimental MCP runtime can run agents
  and an optional container-based verification sandbox; both are outside the
  stable core, carry their own risks, and should be used only in trusted
  repositories.
- **Its content scan is a speed bump.** `skill add` rejects text matching a short
  list of patterns (for example "ignore previous instructions", piping a download
  into a shell). A rephrased instruction passes, and an innocent line such as
  `system: linux` can be flagged. Third-party skills are instructions your model
  will read: review them like code you are about to run.
- **`scan` is pattern matching.** It finds well-known token formats, blocked file
  names and placeholder stubs in staged files. It reports only, unless run with
  `--enforce`; the pre-commit hook uses `--enforce` but can be skipped with
  `git commit --no-verify`. For serious secret detection use a dedicated scanner
  next to it.
- **A legacy fallback exists in the MCP package.** It prefers the resolver of the
  installed `contextos-agents` package. Only if that package cannot be found does
  it load a resolver copy from the project's `.agents/`, as installations from
  before the current layout need.

## Using it safely

1. Pin `contextos-agents` as a development dependency and run the CI gate from
   the pinned version.
2. Review the diff of generated files in pull requests; rule changes are
   instruction changes for every developer's agent.
3. Install third-party skills from commits you have read, with
   `owner/repo@<commit>`.
4. Keep secrets out of rule files. They are committed and read by models.

## Reporting a vulnerability

Please open a private security advisory on the
[GitHub repository](https://github.com/kok-o/contextos-agents/security/advisories/new)
instead of a public issue.

## Complementary tools

ContextOS is a static compiler and a commit-time checker. It does not see what a
model does during a session. A local runtime action firewall (for example
[Stroq](https://github.com/AGGIB/Stroq)) addresses that layer; neither tool
replaces the other.
