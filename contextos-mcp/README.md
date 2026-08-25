# ContextOS MCP Server

An execution layer for the [ContextOS](https://github.com/kok-o/koko-contextos-agents) framework. Exposes an MCP (Model Context Protocol) interface that allows orchestrating agents (like Antigravity) to spawn parallel coding agents in isolated Git worktrees.

## Features
- **Selective Context Loading:** Dynamically reads rules and skills from your `.agents/` directory based on the task, compiling a tailored system prompt without blowing up the context window.
- **Git Worktree Isolation:** Spawns agents in isolated `git worktree` environments. Agents cannot corrupt your main working tree.
- **Security Boundary:** Built-in secret filtering blocks LLM agents from reading `.env` files, SSH keys, or escaping the worktree boundary.
- **Dumb Merge:** The MCP server doesn't decide what code is best. It provides summaries, allows you to request full diffs, and executes `git merge` when instructed by the orchestrator.
- **Direct API Agents:** Agents call OpenAI, Anthropic, or Gemini directly using `pi-ai`, without relying on unstable third-party CLI tools.

---

# Original Documentation (swarm-code)

Open-source swarm-native coding agent orchestrator. Spawns parallel coding agents in isolated git worktrees, orchestrated by a Recursive Language Model (based on [arXiv:2512.24601](https://arxiv.org/abs/2512.24601)).

## Install

```bash
npm install -g swarm-code
```

Requires **Node.js >= 20** and **Python 3**.

### Supported Providers

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` |
| **Google** | `GEMINI_API_KEY` | `gemini-2.5-flash` |

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### From Source

```bash
git clone https://github.com/kingjulio8238/swarm-code.git
cd swarm-code
npm install
npm run build
npm link
```

## Usage

### Swarm Mode — Parallel Coding Agents

Point swarm at a repo with a task. It scans the codebase, decomposes the work, and spawns coding agents in isolated git worktrees:

```bash
swarm --dir ./my-project "add error handling to all API routes"
```

The orchestrator LLM writes Python code that calls `thread()` to spawn agents, `asyncio.gather()` for parallelism, and `merge_threads()` to integrate changes:

```bash
# With auto model routing (picks best agent+model per task)
swarm --dir ./project --auto-route "migrate from Express to Fastify"

# Dry run — plan without executing
swarm --dir ./project --dry-run "refactor auth module"

# Budget cap
swarm --dir ./project --max-budget 5.00 "add comprehensive tests"

# Specific agent backend
swarm --dir ./project --agent claude-code "review and fix security issues"

# Verbose — see routing decisions and memory hints
swarm --dir ./project --verbose --auto-route "optimize database queries"
```

### Agent Backends

| Agent | Description | Best for |
|-------|------------|----------|
| `opencode` (default) | Open-source, multi-provider, tool-capable | General coding, testing |
| `claude-code` | Anthropic's Claude Code CLI | Deep analysis, refactoring |
| `codex` | OpenAI's Codex CLI | Shell commands, OpenAI models |
| `aider` | Git-aware AI coding assistant | Targeted edits, minimal changes |
| `direct-llm` | Bare LLM call, no agent wrapper | Analysis, planning, classification |

### RLM Text Mode (inherited)

The original RLM text-processing mode is preserved:

```bash
swarm run --file large-document.txt "summarize the key findings"
swarm run --url https://example.com/data.txt "extract all dates"
cat data.txt | swarm run --stdin "count the errors"
```

### Interactive Mode

Run with `--dir` but no task to enter interactive mode — a persistent REPL with live thread monitoring:

```bash
swarm --dir ./my-project
```

Commands:

| Command | Description |
|---------|-------------|
| `/threads` | List all threads with status, cost, duration |
| `/thread <id>` | Show thread detail (files changed, diff, result) |
| `/merge` | Merge all completed thread branches |
| `/reject <id>` | Reject a thread's changes |
| `/dag` | Show thread DAG with timing bars |
| `/budget` | Show budget breakdown |
| `/status` | Show session stats |
| `/help` | List commands |
| `/quit` | Cleanup and exit |

Ctrl+C once cancels the current task. Ctrl+C twice exits.

### GitHub Action

Trigger swarm from issue comments. Add `.github/workflows/swarm.yml` to your repo (a template is provided in this repo):

```yaml
name: Swarm Agent
on:
  issue_comment:
    types: [created]
  workflow_dispatch:
    inputs:
      task:
        description: 'Task for swarm to execute'
        required: true
        type: string

jobs:
  swarm:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    if: >
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'issue_comment' &&
       contains(github.event.comment.body, '@swarm'))
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: kingjulio8238/swarm-code@main
        with:
          task: ${{ github.event.inputs.task || '' }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          max_budget: '5.00'
```

Then comment on any issue:

```
@swarm fix the auth bug in src/auth.ts
```

Swarm runs, creates a PR with the changes, and posts a summary back on the issue.

**Security**: Only OWNER/MEMBER/COLLABORATOR can trigger. Fork PRs are rejected. Budget hard cap of $50. API keys are masked in logs.

**Action inputs**: `task`, `anthropic_api_key`, `openai_api_key`, `gemini_api_key`, `agent`, `model`, `max_budget`

**Action outputs**: `success`, `pr_url`, `cost_usd`, `threads_completed`, `threads_failed`, `elapsed_s`, `answer`, `skipped`, `skip_reason`

### MCP Server

Expose swarm as tools for Claude Code, Cursor, or any MCP-compatible agent:

```bash
swarm mcp                       # Start MCP server (stdio)
swarm mcp --dir ./my-project    # Start with default directory
```

**Tools exposed:**

| Tool | Description |
|------|-------------|
| `swarm_run` | Full swarm orchestration — decompose, spawn threads, merge, return result |
| `swarm_thread` | Spawn a single coding agent in an isolated worktree |
| `swarm_status` | Get session status — threads, budget, costs |
| `swarm_merge` | Merge completed thread branches back to main |
| `swarm_cancel` | Cancel running thread(s) |
| `swarm_cleanup` | Destroy session and clean up worktrees |

**Claude Code setup:**

```bash
claude mcp add swarm-code -- npx swarm-code mcp
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "swarm-code": {
      "command": "npx",
      "args": ["swarm-code", "mcp", "--dir", "."],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

**Cursor setup:** Add to `.cursor/mcp.json` with the same format.

Once configured, Claude Code or Cursor can call `swarm_thread` to spawn coding agents in worktrees, check progress with `swarm_status`, and merge with `swarm_merge` — giving the host agent full orchestration control.

### Trajectory Viewer

```bash
swarm viewer
```

Browse saved runs in a TUI. View iterations, code, output, sub-queries, and swarm thread DAGs with timing bars and cost breakdowns. Arrow keys to navigate, Enter to drill down into thread details.

### Benchmarks

```bash
swarm benchmark oolong          # Oolong Synth long-context benchmark
swarm benchmark longbench       # LongBench NarrativeQA benchmark
```

## How It Works

1. **Scan**: Codebase is scanned and loaded as context
2. **Orchestrate**: The RLM loop runs — the LLM writes Python code using swarm primitives
3. **Decompose**: Tasks are broken into independent, parallelizable units
4. **Spawn**: `thread()` / `async_thread()` spawn coding agents in isolated git worktrees
5. **Compress**: Agent output is filtered to successful operations only (episode quality)
6. **Merge**: `merge_threads()` integrates worktree branches back to main
7. **Verify**: Optional test thread validates the merged result

### Python Primitives

```python
# Lightweight LLM query (no file changes)
analysis = llm_query(context[:5000], "List all API endpoints")

# Spawn a coding agent in an isolated worktree
result = thread("Fix the auth bug", files=["src/auth.ts"])

# Parallel threads
import asyncio
results = await asyncio.gather(
    async_thread("Add validation to POST /users", files=["src/routes/users.ts"]),
    async_thread("Add validation to POST /orders", files=["src/routes/orders.ts"]),
)

# Merge all thread branches back to main
merge_threads()

# Return final answer
FINAL("Added input validation to all API routes")
```

### Thread DAG Composition

Thread results compose naturally via Python variable persistence:

```python
# Stage 1: Research in parallel
analysis, test_gaps = await asyncio.gather(
    async_thread("Analyze the auth module", files=["src/auth/"]),
    async_thread("Find files with <50% coverage", files=["package.json"]),
)

# Stage 2: Act on Stage 1 results
await asyncio.gather(
    async_thread("Add rate limiting", context=analysis, files=["src/auth/middleware.ts"]),
    async_thread("Add tests for low-coverage files", context=test_gaps),
)

# Stage 3: Merge and validate
merge_threads()
thread("Run full test suite and fix failures")
```

## Configuration

Create `swarm_config.yaml` in your project root:

```yaml
# Concurrency
max_threads: 5                    # Max concurrent threads
max_total_threads: 20             # Max threads per session
thread_timeout_ms: 300000         # 5min per thread

# Budget
max_thread_budget_usd: 1.00      # Per-thread cost cap
max_session_budget_usd: 10.00    # Total session cost cap

# Agent
default_agent: opencode           # opencode, claude-code, codex, aider, direct-llm
default_model: anthropic/claude-sonnet-4-6
auto_model_selection: false       # Enable auto-routing

# Compression
compression_strategy: structured  # structured, diff-only, truncate, llm-summary

# Model slots — override model per task type
# model_slot_execution: anthropic/claude-sonnet-4-6
# model_slot_search: anthropic/claude-haiku-4-5
# model_slot_reasoning: anthropic/claude-opus-4-6
# model_slot_planning: anthropic/claude-opus-4-6

# Episodic memory — cross-session strategy learning
episodic_memory_enabled: false
memory_dir: ~/.swarm/memory

# Thread cache persistence
thread_cache_persist: false
thread_cache_dir: ~/.swarm/cache
thread_cache_ttl_hours: 24
```

## Key Optimizations

- **Episode quality**: Compression filters agent output to only successful operations — failed attempts, stack traces, and retries are stripped automatically
- **Subthread caching**: Identical threads (same task + files + agent + model) are cached in-memory with optional disk persistence and TTL expiry
- **Named model slots**: Tasks auto-classified into execution/search/reasoning/planning slots, each with preferred agents and optional model overrides
- **Episodic memory**: Persists successful thread strategies to disk; trigram-based similarity recall informs agent/model selection in future sessions
- **DAG composition**: Thread results compose via Python variable persistence (T1+T2 → T3); orchestrator prompt teaches multi-stage pipelines and failure re-routing
- **Failure tracking**: Exponential-decay weighted failure rates per agent/model pair — recent failures penalized more, agents that keep failing get routed around

## Architecture

```
src/
├── main.ts                    CLI entry point (swarm/run/viewer/benchmark)
├── swarm.ts                   Swarm orchestration (single-shot)
├── interactive-swarm.ts       Interactive REPL with live monitoring
├── cli.ts                     RLM text mode
├── core/
│   ├── rlm.ts                 Core RLM loop (Algorithm 1)
│   ├── repl.ts                Python REPL bridge (JSON over stdin/stdout)
│   ├── runtime.py             Python runtime (thread/async_thread/merge)
│   └── types.ts               Shared type definitions
├── agents/
│   ├── provider.ts            AgentProvider interface + registry
│   ├── opencode.ts            OpenCode (subprocess + server mode)
│   ├── claude-code.ts         Claude Code CLI backend
│   ├── codex.ts               Codex CLI backend
│   ├── aider.ts               Aider backend
│   └── direct-llm.ts          Bare LLM calls
├── threads/
│   ├── manager.ts             Thread lifecycle + concurrency + episodes
│   └── cache.ts               Subthread cache (memory + disk)
├── worktree/
│   ├── manager.ts             Git worktree CRUD
│   └── merge.ts               Branch merging
├── compression/
│   └── compressor.ts          Result compression strategies
├── routing/
│   └── model-router.ts        Auto model/agent selection + failure tracking
├── memory/
│   └── episodic.ts            Cross-session strategy learning
├── prompts/
│   └── orchestrator.ts        Swarm system prompt
├── mcp/
│   ├── server.ts              MCP server entry point (stdio transport)
│   ├── tools.ts               Tool definitions + handlers
│   └── session.ts             Per-directory session state
├── ui/
│   ├── onboarding.ts          First-run setup wizard
│   ├── spinner.ts             CLI spinner
│   ├── dashboard.ts           Live progress dashboard
│   └── summary.ts             Session summary + JSON output
└── viewer.ts                  Trajectory TUI + DAG viewer
action/
├── entrypoint.ts              GitHub Action orchestration
├── parse-trigger.ts           @swarm comment parsing
├── security.ts                Auth + fork detection + budget caps
└── pr.ts                      PR creation + issue commenting
```

## Development

```bash
npm install                    # Install deps
npx tsx src/main.ts --dir .    # Run in dev mode
npm run build                  # Compile TypeScript
npm test                       # Run tests
```

## License

MIT
