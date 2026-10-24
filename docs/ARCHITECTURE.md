# ContextOS Core Architecture

## Product boundary

The stable `contextos-agents` package manages version-controlled engineering
rules for supported AI coding agents. It validates rule sources, renders
agent-native files, and detects when those files no longer match their sources.

The MCP server is a separate beta package, frozen at read-only inspection. Agent
orchestration and code-execution runtime features are experimental and are not
part of the stable core contract.

## What lives where

| Place | Holds | Who owns it |
| --- | --- | --- |
| `node_modules/contextos-agents` | The tool: CLI, compiler, adapters, resolver, schemas, bundled core rules and the skill catalog | The package; never copied into a project |
| `.agents/project/skills/` | Your rules | You |
| `.agents/core/`, `.agents/AGENTS.md` | Optional bundled rules (`init --with-core`) | Copied once; refreshed by `update` |
| Agent files (`.claude/`, `.cursor/rules/`, `.agents/skills/`, Copilot, Aider, Zed) | Generated output | ContextOS, recorded in the lockfile |
| `.agents/lockfile.v2.json` | Path, generator and content hash of every generated file | Generated; committed |
| `.agents/compiled/`, `.agents/.contextos/` | Registry cache and transaction journals | Derived; ignored by git |

## Core data flow

```mermaid
flowchart TD
    A[Rule sources: .agents/project/skills] --> B[Compile: registry cache]
    A --> E[Adapters render in memory]
    C[Active profile] --> E
    B --> D[Resolver: task recommendation]
    E --> F[Journaled transaction: all or nothing]
    F --> G[Agent files and lockfile]
    E --> H[Drift check: render again, compare with disk]
    G --> H
```

Rendering is pure: an adapter turns the rule set into a list of artifacts in
memory. Applying them and checking them are separate steps over that list, so
`export` and `export --check` cannot disagree about what the output should be.

## Components

### Sources and activation

A rule is a folder with a `SKILL.md` (frontmatter `name`, `description`, optional
`activation` and `globs`) and, optionally, a manifest. `activation` is resolved in
one place (`adapters/shared.js`) and every adapter maps it to its client's native
mechanism; see the [compatibility matrix](ADAPTER_COMPATIBILITY.md).

### Resolver

`resolve` recommends rules for a task from the task text, touched files and the
workspace. Catalog skills use built-in signals; your own rules are matched on
their name and description. It recommends; adapters do not consume its output:
an export contains every installed rule that the profile allows.

### Adapters and the lockfile

Adapters are deterministic: same sources, same bytes, whatever line endings the
checkout uses. The lockfile records each generated file by path, generator and
hash, sorted by path, with nothing that changes on every run. Files that also
hold user text (Copilot instructions) record only the hash of the generated
block. See the [team workflow](TEAM_WORKFLOW.md) for how this behaves in merges.

### Safe writes

Every filesystem change by `export`, `init`, `update` and `uninstall` is staged in
a journaled transaction that resolves each path inside the project root and
refuses symlink or junction escapes, checks the previous hash of each file it
replaces, and rolls back on failure. A file is replaced or deleted only if
ContextOS wrote it and it is unchanged. `bin/lib/safe-writer.js` only plans.

### CI quality gate

`contextos gate` and `export --check` compare rendered output with disk.
Application tests, type checks, secret scanning and policy validation are
separate; passing this gate does not establish application correctness.

## Separate packages and experimental features

The read-only MCP server is maintained in `contextos-mcp`. Task routing, subagent
orchestration and execution sandboxes are experimental; they carry separate
requirements and guarantees from the stable core. The core's plugin supply-chain
check is built from `contextos-mcp/src/plugins` into a single committed file,
`.agents/transaction-core/plugin-supply-chain-bundle.js`; regenerate it with
`npm run build:supply-chain` in `contextos-mcp` (see [CONTRIBUTING](../CONTRIBUTING.md)).
