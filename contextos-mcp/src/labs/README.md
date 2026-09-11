# Labs — Experimental & Deprecated Features

> ⚠️ **These modules are NOT part of the stable `@contextos/mcp` API surface.**
> They are under active research or scheduled for removal.
> Do not import from this directory in production code.

## Modules

| Module | Status | Description |
|--------|--------|-------------|
| `episodic-memory.ts` | **Research** | RLM episodic memory tree. Persists successful thread strategies to enable future intelligent routing. Not yet connected to production routing. |
| `ts-analyzer.ts` | **Deprecated** | TypeScript AST codebase analyzer. Superseded by the graphify skill in `contextos-agents`. No active callers. |
| `interactive-swarm.ts` | **Experimental** | Interactive REPL for the swarm orchestrator. Only used by `main.ts` in direct CLI mode. Not part of the MCP server path. |
| `interactive.ts` | **Experimental** | Older interactive CLI framework (predecessor to interactive-swarm). |
| `viewer.ts` | **Experimental** | Trajectory file browser. Only used by `swarm viewer` CLI sub-command. |
| `cli.ts` | **Experimental** | Base CLI logic for earlier iterations, moving away from core MCP bridge. |

## Policy

- No Labs module may be imported by stable/beta production code.
- Labs modules may reference each other.
- Labs modules are excluded from `npm pack` via `.npmignore`.
