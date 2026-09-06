# ContextOS MCP Server

An execution layer for the [ContextOS](https://github.com/kok-o/contextos-agents) framework. Exposes an MCP (Model Context Protocol) interface that allows orchestrating agents (like Antigravity) to spawn parallel coding agents in isolated Git worktrees.

## Features
- **Selective & Multilingual Context Loading:** Dynamically reads rules and skills from your `.agents/` directory using bilingual (English & Russian) keyword triggers. Extracts essential sections (`extractEssentialSkillContent`), significantly reducing prompt token overhead while auto-injecting project invariants from `AGENTS.md` and `GEMINI.md`.
- **Git Worktree Isolation & Concurrency Safety:** Spawns agents in isolated `git worktree` environments (`.swarm-worktrees/`). Agents cannot corrupt your main working tree, and transient git lock contention (`.git/index.lock`) is mitigated with mutexes and retries.
- **Disk-Backed Session Persistence & Recovery:** All thread lifecycles, states, and diffs are persisted to `.swarm-worktrees/session-state.json`. If the MCP server or IDE process restarts, background tasks and branches remain trackable and recoverable.
- **Automated In-Worktree Proof-of-Work Verification:** Support for `verify_command` (e.g. `npm test`, `pytest`) executes test suites directly in the agent's worktree before marking tasks as successful.
- **Non-Blocking Asynchronous Delegation:** Optional `wait: false` returns immediate task and thread IDs, preventing MCP client timeouts on long-running jobs and enabling polling via `contextos_status`.
- **Deep Orphan Purging:** `contextos_cleanup` with `purge_orphans: true` automatically detects and deletes abandoned `swarm/*` branches and stale worktree directories.
- **Multi-Engine Agent Backends:** Flexible choice of execution engines (`direct-llm`, `opencode`, `claude-code`, `codex`, `aider`).
- **Security Boundary:** Built-in secret filtering blocks LLM agents from reading `.env` files, SSH keys, or escaping the worktree boundary.
- **Deterministic 3-Way Merge:** The MCP server computes structured diffs, identifies conflicts, and safely executes `git merge` only when instructed by the orchestrator.
- **Direct API & Router Support:** Direct multi-provider integration with Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, and Ollama via `pi-ai`.

## Security & Execution Model

The ContextOS MCP execution runtime applies strict defense-in-depth isolation across all supported subagent backends:

- **Isolated Git Worktrees (`.swarm-worktrees/`):** Every subagent operates in a private git worktree branch (`swarm/<threadId>`). The developer's primary workspace and active staging area cannot be altered or reset during subagent execution.
- **Headless CLI Execution & `--dangerously-skip-permissions`:**
  - Non-interactive agents (like Claude Code) execute with `--dangerously-skip-permissions` to allow headless autonomous editing without interactive user prompts.
  - This is safe within ContextOS because:
    1. Subagents are confined to their specific worktree directory;
    2. Path validation (`isPathAllowed`, `path.relative`) blocks path traversal outside the worktree;
    3. Sensitive paths (`.env`, SSH keys, `.pem`, `.git`) are strictly blocked before staging (`isBlockedPath`);
    4. Child process environments are sanitized via strict allowlists (`getSanitizedEnv`) to prevent credential leakage.
- **Python Sandbox Restrictions:** The embedded Python REPL (`runtime.py`) enforces strict AST validation, forbids dangerous dunder attributes (`__subclasses__`, `__globals__`, `__reduce__`), restricts module imports to safe standard libraries (`json`, `math`, `re`, `datetime`, `random`, `collections`), and blocks dynamic class creation via 3-argument `type()`.
- **Egress Secret Redaction:** All output channels (episodic memory, compression diffs, MCP error messages, direct LLM prompts) pass through `SecretFilter` (`redactSecrets`) to redact API keys and tokens.
- **Safe Verification & Non-Destructive Merges:**
  - `verify_command` enforces a strict whitelist of verification binaries (`npm`, `pytest`, `cargo`, `go`, etc.), sanitizes environment variables, and rejects shell metacharacters and operator chaining (`&&`, `;`, `|`).
  - Merge failures invoke `git merge --abort` and strictly forbid destructive commands like `git reset --hard HEAD` in the user's workspace.

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
# Start MCP server via stdio
npx contextos-mcp
npx contextos-mcp --dir ./my-project
```

**Tools exposed (`contextos_*`):**

| Tool | Description |
|------|-------------|
| `contextos_delegate` | Delegate task(s) to isolated git worktree agents with automatic skill selection, secret filtering, and proof-of-work verification |
| `contextos_status` | Query active task lifecycle, thread states, verification results, and token costs |
| `contextos_compare` | Benchmark and compare competing candidate thread solutions (tests, tokens, diff size) |
| `contextos_diff` | Inspect the clean, structured Git diff produced by a thread before deciding to merge |
| `contextos_merge` | Perform a safe 3-way Git merge with conflict detection and non-destructive rollback |
| `contextos_cleanup` | Clean up active worktree sessions or safely purge orphaned `swarm/*` branches |

**IDE / MCP Client Setup (Claude Code, Antigravity, Cursor):**

Add to your project's `.mcp.json` or MCP settings:

```json
{
  "mcpServers": {
    "contextos": {
      "command": "npx",
      "args": ["-y", "contextos-mcp", "--dir", "."],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

Once configured, your host orchestrator can invoke `contextos_delegate` to spawn subagents, inspect progress with `contextos_status` and `contextos_diff`, and safely integrate changes with `contextos_merge`.

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

## Security & Execution Model

### Headless Agent Execution & `--dangerously-skip-permissions`
When running Claude Code or other CLI backends non-interactively in automated swarm threads, the `--dangerously-skip-permissions` flag is required so child processes do not block waiting on interactive terminal confirmation prompts.

This execution model is strictly protected by four architectural safety layers:
1. **Isolated Git Worktrees:** Every agent thread executes inside an ephemeral git worktree directory (`.swarm-worktrees/mcp-*`) completely separate from the user's primary working tree.
2. **Worktree Path Traversal Verification:** All paths are checked via `resolve()` and verified to reside strictly within the intended repository boundaries.
3. **Secret Egress Filtering (`SecretFilter`):** Diffs, error messages, and episodic memory records are passed through redaction regexes before leaving the sandbox, preventing accidental disclosure of `.env` secrets, tokens, or credentials.
4. **Sanitized Environment & Resource Safety:** API credentials are not leaked to child processes, and unbounded process outputs are constrained via `RollingBuffer` (2MB stdout, 512KB stderr) to eliminate out-of-memory denial-of-service risks.

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
