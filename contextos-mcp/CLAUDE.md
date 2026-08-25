# swarm-code

Open-source swarm-native coding agent orchestrator. Fork of rlm-cli extended with parallel coding agent threads in isolated git worktrees.

**Published**: `npm install -g swarm-code` / `npx swarm-code`
**Repo**: https://github.com/kingjulio8238/swarm-code

## Quick Start

```bash
# Install deps
npm install

# Development (Swarm mode)
npx tsx src/main.ts --dir ./my-project "add error handling"

# Development (Interactive mode)
npx tsx src/main.ts --dir ./my-project

# Development (MCP server)
npx tsx src/main.ts mcp --dir ./my-project

# Development (RLM text mode)
npx tsx src/main.ts run --file data.txt "analyze this"

# Build
npm run build
```

## Development Workflow

### Prerequisites

- Node.js >= 20
- Python 3.x (for the REPL runtime — checked at startup with a clear error if missing)
- npm (not pnpm — this project uses package-lock.json)

### Common Commands

```bash
npm install              # Install dependencies
npm run build            # TypeScript compile + copy runtime.py to dist/
npm test                 # Run all 405 tests (vitest)
npm run test:watch       # Watch mode
npm run lint             # Biome check (lint + format + import sorting)
npm run lint:fix         # Auto-fix lint issues
npx tsc --noEmit         # Typecheck only
```

### Before Committing

Always run these three checks — they match what CI enforces:

```bash
npm run lint             # Biome (lint + formatting)
npx tsc --noEmit         # TypeScript typecheck
npm test                 # All tests pass
```

### CI Pipeline

GitHub Actions runs on every push to main and every PR (`.github/workflows/test.yml`):

| Job | What it does |
|-----|-------------|
| **Lint** | `biome check --reporter=github src/ tests/` |
| **Typecheck** | `tsc --noEmit` |
| **Test** | `vitest run` on Node 20 + 22, with Python 3.12 |
| **Build** | `npm run build` (runs after lint+typecheck+test pass) |

Concurrency group cancels superseded runs on the same branch. Test matrix uses `fail-fast: false` so both Node versions always run.

### Testing

- **Framework**: Vitest 4.x (ESM-only)
- **Test timeout**: 30s per test, 15s per hook (vitest.config.ts)
- **Structure**: `tests/unit/` for isolated logic, `tests/integration/` for real git repos + mock agent
- **Mock agent**: `src/agents/mock.ts` — self-registers, writes real files in worktrees, supports `__FAIL__` trigger for failure paths
- **Temp repos**: `createTempGitRepo()` / `cleanupTempRepo()` from `tests/fixtures/helpers.ts` — creates real git repos in os.tmpdir
- **Fake timers**: Use `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for TTL, decay, and timestamp tests — never `setTimeout` with real waits
- **No flaky tests**: All 405 tests are deterministic. If a test depends on timing, it must use fake timers.

### Linting

- **Tool**: Biome 2.x (not ESLint/Prettier)
- **Config**: `biome.json` — tabs, 120 line width, double quotes, semicolons
- **Auto-fix**: `npm run lint:fix` fixes most issues. For "suggested" (unsafe) fixes: `npx biome check --write --unsafe src/ tests/`
- **Disabled rules**: `noExplicitAny`, `noNonNullAssertion`, `noParameterAssign`, `noControlCharactersInRegex` (intentional ANSI stripping), `noImplicitAnyLet`, `noForEach`, `noAssignInExpressions`
- **Warnings**: `noUnusedVariables`, `noUnusedImports` (warn, not error)

### Publishing

```bash
# Bump version in package.json
npm version patch|minor|major

# Publish (prepublishOnly runs build automatically)
npm publish

# Tag the release
git push --tags
```

Package name is `swarm-code` on npm. Bin entries: `swarm-code` (primary) and `swarm` (alias). The `files` field in package.json whitelists only `dist/`, `bin/`, and `runtime.py` — no src/tests/config leak into the tarball.

## Architecture

- `src/main.ts` — CLI entry point, routes to swarm/run/interactive/viewer/benchmark
- `src/swarm.ts` — Swarm mode: scans repo, sets up threads, runs RLM loop with orchestrator prompt
- `src/interactive-swarm.ts` — Interactive REPL mode with session persistence and live thread monitoring
- `src/core/rlm.ts` — Core RLM loop (Algorithm 1 from arXiv:2512.24601)
- `src/core/repl.ts` — Python REPL bridge (line-delimited JSON over stdin/stdout). Checks for Python 3 at startup.
- `src/core/runtime.py` — Python runtime with thread(), async_thread(), merge_threads()
- `src/agents/` — Agent backends (opencode, claude-code, codex, aider, direct-llm, mock)
- `src/agents/provider.ts` — AgentProvider interface + registry. Agents self-register on import.
- `src/routing/model-router.ts` — Auto model/agent selection based on task complexity + named slots + episodic memory + failure tracking (exponential decay)
- `src/threads/manager.ts` — Thread lifecycle + concurrency (AsyncSemaphore) + subthread caching + episode recording
- `src/threads/cache.ts` — Subthread cache with optional disk persistence and TTL expiry
- `src/memory/episodic.ts` — Episodic memory: persists successful strategies, trigram-based recall, aggregate stats per agent
- `src/hooks/runner.ts` — Lifecycle hooks (post_thread, post_merge, post_session). Deterministic verification — success silent, errors surfaced
- `src/worktree/` — Git worktree CRUD + merge
- `src/compression/` — Result compression with episode quality filtering (success-only output)
- `src/prompts/orchestrator.ts` — Swarm orchestrator system prompt with DAG composition examples
- `src/viewer.ts` — Trajectory TUI viewer with swarm thread DAG visualization, timing bars, cost breakdowns
- `src/mcp/` — MCP server: exposes swarm as tools for Claude Code, Cursor, etc. (server, tools, session)
- `src/ui/` — CLI UI components (onboarding wizard, spinner, dashboard, session summary)
- `src/env.ts` — Env var loader. Must be imported BEFORE pi-ai. Loads from shell > .env > ~/.swarm/credentials
- `action/` — GitHub Actions composite action (entrypoint, trigger parsing, security, PR creation)

## Key Design

Python REPL primitives:
- `llm_query(sub_context, instruction)` — lightweight LLM call
- `thread(task, context, agent, model, files)` — spawn coding agent in worktree
- `async_thread(...)` — async version for asyncio.gather()
- `merge_threads()` — merge completed thread branches
- `FINAL(answer)` — return result

JSON protocol between Python and TypeScript:
- `thread_request` / `thread_result` — thread spawn/completion
- `merge_request` / `merge_result` — branch merging
- `llm_query` / `llm_result` — sub-queries (inherited from rlm-cli)

### Key Dependencies

- `@mariozechner/pi-ai` — Core LLM API library (getModels, getProviders, completeSimple). Used in swarm.ts, cli.ts, interactive.ts, rlm.ts, direct-llm.ts. NOT a leftover — essential.
- `@modelcontextprotocol/sdk` — MCP server protocol
- `zod` — Schema validation for MCP tool inputs

## Config

`swarm_config.yaml` at project root. Key settings:
- `max_threads`: concurrent thread limit (default: 5)
- `default_agent`: agent backend (default: opencode). Options: opencode, claude-code, codex, aider, direct-llm
- `auto_model_selection`: enable auto-routing (default: false). CLI: `--auto-route`
- `compression_strategy`: structured | diff-only | truncate | llm-summary
- `model_slot_execution/search/reasoning/planning`: per-slot model overrides (empty = auto-select)
- `episodic_memory_enabled`: enable cross-session strategy learning (default: false)
- `thread_cache_persist`: enable disk persistence for subthread cache (default: false)

## Key Optimizations

- **Episode quality**: Compression filters agent output to only successful operations — failed attempts, stack traces, retries stripped automatically
- **Subthread caching**: Identical threads (same task+files+agent+model) cached in-memory with optional disk persistence and TTL expiry; second call returns instantly
- **Named model slots**: Tasks auto-classified into execution/search/reasoning/planning; each slot has preferred agents and optional model overrides
- **Episodic memory**: Persists successful thread strategies to disk; trigram-based similarity recall informs agent/model selection in future sessions
- **DAG composition**: Thread results compose via Python variable persistence (T1+T2 → T3); orchestrator prompt teaches multi-stage pipelines and failure re-routing
- **Failure tracking**: FailureTracker class uses exponential-decay weighting to penalize recently-failed agent/model pairs in routing decisions
- **Interactive mode**: Session-persistent REPL with /threads, /merge, /reject, /dag, /budget commands and SIGINT handling (single=cancel task, double=exit)
- **GitHub Action**: Composite action triggered by `@swarm` in issue comments or workflow_dispatch. Security: author association check, fork PR rejection, $50 budget hard cap. Creates PRs and posts result comments.
- **MCP server**: Exposes 6 tools (swarm_run, swarm_thread, swarm_status, swarm_merge, swarm_cancel, swarm_cleanup) over stdio transport. Per-directory sessions with lazy-init ThreadManager/WorktreeManager. Claude Code: `claude mcp add swarm-code -- npx swarm-code mcp`

## Gotchas

- **env.ts import order**: `src/env.ts` must be imported before any module that reads env vars (pi-ai reads them at import time). All entry points (cli.ts, swarm.ts, interactive.ts, interactive-swarm.ts) do this correctly with dynamic imports.
- **Mock agent in tests**: Integration tests that need the agent registry must `import "../../src/agents/mock.js"` before importing session/manager modules. The mock agent self-registers on import.
- **Module-level state**: `src/mcp/session.ts` uses a global `Map<string, SwarmSession>` keyed by absolute path. Tests must call `cleanupAllSessions()` in afterEach to avoid cross-test contamination.
- **CRLF line endings**: The bin shim (`bin/swarm.mjs`) must use LF line endings or the shebang breaks on Unix. If you edit it on Windows, check with `file bin/swarm.mjs`.
- **AsyncSemaphore is exported**: `src/threads/manager.ts` exports `AsyncSemaphore` (used directly in tests). Don't make it private again.
- **`biome.json` schema**: Uses local reference (`./node_modules/@biomejs/biome/configuration_schema.json`), not a URL. This avoids 404s when the remote schema isn't published for the exact version.
