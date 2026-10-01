# ContextOS: five-minute onboarding

ContextOS selects engineering instructions for a task and exports them into client
configuration files. Start with one task and one team rule. You need Node.js 22+
and a project folder; these steps do not call a model API.

## 1. Install in your project

```sh
npm install --save-dev contextos-agents
npx --no-install contextos init --minimal
npx --no-install contextos skill add typescript
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if your script execution policy
blocks the PowerShell wrappers. Commit your package lockfile to pin the version.
The current repository candidate can instead be installed from its local tarball:
see the [tested demo](../../examples/quickstart/README.md).

Initialization exports the shared `.agents/skills` projection. Codex can discover
that path. Export another adapter explicitly when your team uses that client.

## 2. Inspect a task's selection

```sh
npx --no-install contextos resolve "Implement TypeScript validation" --files src/order.ts --explain
npx --no-install contextos resolve "Implement TypeScript validation" --files src/order.ts --json
```

The result identifies selected skills and the evidence for each selection. Token
counts estimate skill bodies; client prompts, tools, and conversation history add
more context. A soft budget may overflow to retain required instructions.

## 3. Add your team's rule

Copy the [team-order example](../../examples/quickstart/team-order/SKILL.md) and its
[skill.yaml](../../examples/quickstart/team-order/skill.yaml) to:

```text
.agents/project/skills/team-order/
  SKILL.md
  skill.yaml
```

Edit the rule to fit your project. Use the project directory for your own skills;
use `contextos skill override engineering-workflow` when customizing a built-in.
Core updates retain project overrides.

```sh
npx --no-install contextos compile
npx --no-install contextos resolve "Implement @team-order TypeScript validation" --files src/order.ts --explain
npx --no-install contextos export all
```

The explicit `@team-order` request should select the team rule. Its generated
native entrypoint is `.agents/skills/team-order/SKILL.md`. Edit source rules under
`.agents/project`, then compile and export again.

## 4. Verify exported files

```sh
npx --no-install contextos export all --check --json
```

Exit zero means managed exports match the current sources. A changed source or
missing export causes drift. If someone edited a managed output, review and move
that change into its source before exporting; ownership conflicts can refuse an
overwrite. Existing user files are not blanket overwrite targets.

Useful paths:

| Purpose | Path |
| --- | --- |
| Built-in source | `.agents/core/skills/` |
| Your rules and overrides | `.agents/project/skills/` |
| Shared native skills | `.agents/skills/` |
| Compiled registry | `.agents/compiled/registry.v2.json` |
| Managed artifact provenance | `.agents/lockfile.v2.json` |

For other clients, check the [adapter matrix](../ADAPTER_COMPATIBILITY.md). An
export test proves the file configuration; it does not prove client loading or
model adherence. In Codex, try a task explicitly referencing `$team-order` and
inspect skill loading and the resulting patch.

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
installation and scripts, use the composite action described in the [guide](../../GUIDE.md).

After changing source rules, compile, export, inspect the diff, and commit the
source plus managed outputs and lockfile together. For updates and removal:

```sh
npx --no-install contextos update
npx --no-install contextos uninstall --yes
```

The repository's installed-package acceptance gate verifies initialization,
custom skill selection, export drift, update and uninstall preservation, and a
read-only MCP protocol request in a fresh project. None of these checks measures
AI answer quality or promises token savings.
