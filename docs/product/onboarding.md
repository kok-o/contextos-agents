# ContextOS: five-minute onboarding

ContextOS keeps your coding-agent rules in one place and exports them into the
files each agent reads. Start with one project and one team rule. You need
Node.js 22+ and a project folder; these steps do not call a model API.

## 1. Install in your project

This guide targets the unpublished core **3.0.0-rc.1** candidate. Build the
[local archive](../RELEASE_3.0.0-rc.1.md) first; do not fetch `latest` for these steps.

```sh
npm install --save-dev --save-exact /path/to/contextos-agents-3.0.0-rc.1.tgz
npx --no-install contextos init
```

`init` creates `.agents/project/skills/` for your rules and adds a `.gitignore`
block for derived caches. It copies no tool code and no bundled rules into the
project. Commit your package lockfile to pin the version. To also install the
seven bundled engineering skills and `AGENTS.md`, use `init --with-core`; to add
catalog skills, use `contextos skill add typescript` or a preset such as
`init --preset frontend`.

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if your script execution
policy blocks the PowerShell wrappers. The current repository candidate can
instead be installed from its local tarball: see the
[tested demo](../../examples/quickstart/README.md).

## 2. Add your team's rule

Create `.agents/project/skills/team-order/SKILL.md`, or copy the
[team-order example](../../examples/quickstart/team-order/SKILL.md) together with
its [skill.yaml](../../examples/quickstart/team-order/skill.yaml):

```markdown
---
name: team-order
description: "Order handling rules for the checkout service."
activation: auto
---
# Order handling

- Keep `createOrder` pure; do I/O in the caller.
```

`activation` chooses how the rule reaches the agent: `always` (every session),
`globs` (matching files, with a `globs:` list) or `auto` (the agent decides from
the description). See the table in the [README](../../README.md#how-a-rule-reaches-each-agent).
Use `contextos skill override engineering-workflow` when you customize a bundled
rule; project files always take precedence over bundled ones.

## 3. Export and verify

```sh
npx --no-install contextos compile
npx --no-install contextos export all
npx --no-install contextos export all --check --json
```

Exit zero means every generated file matches the current sources. A changed
source or a missing export is reported as drift (exit `1`); an unreadable
lockfile or unresolved merge conflict is an error (exit `2`). If someone edited a
generated file, the next export refuses to overwrite it: move the change into
its source, restore the file, or use `--force`. Files you own are never replaced
silently.

Useful paths:

| Purpose | Path |
| --- | --- |
| Your rules | `.agents/project/skills/` |
| Bundled rules, if installed | `.agents/core/skills/` |
| Claude Code output | `.claude/rules/`, `.claude/skills/` |
| Shared native skills (Codex, Gemini CLI) | `.agents/skills/` |
| Which files ContextOS wrote | `.agents/lockfile.v2.json` |
| Derived registry cache (not committed) | `.agents/compiled/` |

An export test proves the file; it does not prove that a client loaded it or
that a model followed it. To check a client yourself, use the protocol in the
[compatibility matrix](../ADAPTER_COMPATIBILITY.md#verification-record).

## 4. Ask what applies to a task

```sh
npx --no-install contextos resolve "Implement order validation" --files src/order.ts --explain
```

The result names the recommended rules and the evidence for each, including
your own rules (matched on name and description). Skills that are not installed
are listed as such. Resolution recommends; exports contain every installed rule
the profile allows.

## 5. Keep the check reproducible

For your own trusted repository, a CI job can install the locked development
package and run the same check:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: "22"
      cache: npm
  - run: npm ci --ignore-scripts
  - run: npx --no-install contextos export all --check --json
```

This installs your project's dependencies. For a gate isolated from consumer
installation and scripts, use the composite action described in the
[guide](../../GUIDE.md#ci-configuration-check).

After changing source rules, export, inspect the diff, and commit the sources,
generated files and lockfile together. For branches and merges see the
[team workflow](../TEAM_WORKFLOW.md). To upgrade or remove:

```sh
npx --no-install contextos update               # refresh bundled files, migrate 2.x projects
npx --no-install contextos uninstall --dry-run  # show what would be removed
npx --no-install contextos uninstall --yes
```

`uninstall` removes generated files, managed blocks, the lockfile and caches, and
keeps `.agents/project/` and anything you edited.

The repository's installed-package acceptance gate verifies initialization,
custom rule selection, export drift, merges, update and uninstall preservation,
and a read-only MCP protocol request in a fresh project. None of these checks
measures AI answer quality or promises token savings.
