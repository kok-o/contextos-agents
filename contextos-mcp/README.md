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
  - **Trust Boundary & Isolation Details:**
    1. **Workspace & Branch Protection:** Subagents operate in dedicated Git worktree branches (`swarm/<threadId>`), preventing race conditions and keeping the user's primary working directory clean;
    2. **Pre-Commit File Filtering:** Changed files are filtered before git staging (`isBlockedPath`, `isPathAllowed`), preventing commits of sensitive files (`.env`, SSH keys, `.git`);
    3. **Environment Sanitization:** Child processes receive an allowlisted environment (`getSanitizedEnv`) to prevent accidental token propagation;
    4. **OS-Level Isolation Notice:** Subagent processes run under host user privileges. Git worktrees and pre-commit checks provide version control safety, not kernel-level OS sandboxing. For multi-tenant or untrusted agent workflows, ContextOS must be paired with an OS-level container (Docker/Podman) or OS sandbox (e.g. bubblewrap / seatbelt).
- **Python Sandbox Restrictions:** The embedded Python REPL (`runtime.py`) enforces strict AST validation, forbids dangerous dunder attributes (`__subclasses__`, `__globals__`, `__reduce__`), restricts module imports to safe standard libraries (`json`, `math`, `re`, `datetime`, `random`, `collections`), and blocks dynamic class creation via 3-argument `type()`.
- **Egress Secret Redaction:** All output channels (episodic memory, compression diffs, MCP error messages, direct LLM prompts) pass through `SecretFilter` (`redactSecrets`) to redact API keys and tokens.
- **Safe Verification & Non-Destructive Merges:**
  - `verify_command` enforces a strict whitelist of verification binaries (`npm`, `pytest`, `cargo`, `go`, etc.), sanitizes environment variables, and rejects shell metacharacters and operator chaining (`&&`, `;`, `|`).
  - Merge failures invoke `git merge --abort` and strictly forbid destructive commands like `git reset --hard HEAD` in the user's workspace.

---

## Usage

### MCP Server (Primary Interface)

The MCP server is the primary way to use ContextOS MCP. It exposes tools for Claude Code, Antigravity, Cursor, or any MCP-compatible agent:

```bash
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

### Supported Providers

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` |
| **Google** | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| **OpenRouter** | `OPENROUTER_API_KEY` | (configurable) |
| **Groq** | `GROQ_API_KEY` | (configurable) |
| **Ollama** | *(local)* | (configurable) |

### Agent Backends

| Agent | Description | Best for |
|-------|------------|----------|
| `opencode` (default) | Open-source, multi-provider, tool-capable | General coding, testing |
| `claude-code` | Anthropic's Claude Code CLI | Deep analysis, refactoring |
| `codex` | OpenAI's Codex CLI | Shell commands, OpenAI models |
| `aider` | Git-aware AI coding assistant | Targeted edits, minimal changes |
| `direct-llm` | Bare LLM call, no agent wrapper | Analysis, planning, classification |

### Swarm Mode — Parallel Coding Agents

Point the CLI at a repo with a task. It scans the codebase, decomposes the work, and spawns coding agents in isolated git worktrees:

```bash
npx contextos-mcp swarm --dir ./my-project "add error handling to all API routes"
```

The orchestrator LLM writes code that calls `thread()` to spawn agents and `merge_threads()` to integrate changes:

```bash
# Dry run — plan without executing
npx contextos-mcp swarm --dir ./project --dry-run "refactor auth module"

# Budget cap
npx contextos-mcp swarm --dir ./project --max-budget 5.00 "add comprehensive tests"

# Specific agent backend
npx contextos-mcp swarm --dir ./project --agent claude-code "review and fix security issues"
```

### Interactive Mode

Run with `--dir` but no task to enter interactive mode — a persistent REPL with live thread monitoring:

```bash
npx contextos-mcp interactive --dir ./my-project
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

### Orchestrator Primitives

The RLM orchestrator executes JavaScript/TypeScript code (or Python via `--python-repl` fallback) using these primitives:

```javascript
// Lightweight LLM query (no file changes)
const analysis = await llm_query(context.slice(0, 5000), "List all API endpoints");

// Spawn a coding agent in an isolated worktree
const result = await thread("Fix the auth bug", { files: ["src/auth.ts"] });

// Parallel threads
const [users, orders] = await Promise.all([
  thread("Add validation to POST /users", { files: ["src/routes/users.ts"] }),
  thread("Add validation to POST /orders", { files: ["src/routes/orders.ts"] }),
]);

// Merge all thread branches back to main
await merge_threads();

// Return final answer
FINAL("Added input validation to all API routes");
```

> **Note:** Python 3 is no longer required. The default execution engine uses a native `node:vm` sandbox (`NodeVmRepl`). Pass `--python-repl` or `--repl python` to use the legacy Python runtime.

## How It Works

1. **Scan**: Codebase is scanned and loaded as context
2. **Orchestrate**: The RLM loop runs — the LLM writes orchestrator code using swarm primitives
3. **Decompose**: Tasks are broken into independent, parallelizable units
4. **Spawn**: `thread()` spawns coding agents in isolated git worktrees
5. **Compress**: Agent output is filtered to successful operations only (episode quality)
6. **Merge**: `merge_threads()` integrates worktree branches back to main
7. **Verify**: Optional test thread validates the merged result

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

# Compression
compression_strategy: structured  # structured, diff-only, truncate, llm-summary
```

## Architecture

```
src/
├── main.ts                    CLI entry point
├── swarm.ts                   Swarm orchestration (single-shot)
├── interactive-swarm.ts       Interactive REPL with live monitoring
├── cli.ts                     RLM text mode
├── core/
│   ├── rlm.ts                 Core RLM loop (Algorithm 1)
│   ├── repl.ts                Python REPL bridge (legacy fallback)
│   ├── node-repl.ts           Native node:vm sandbox (default)
│   ├── repl-interface.ts      Common Repl interface
│   ├── runtime.py             Python runtime (legacy fallback)
│   └── types.ts               Shared type definitions
├── agents/                    Agent backend implementations
├── threads/                   Thread lifecycle + caching
├── worktree/                  Git worktree CRUD + merging
├── compression/               Result compression strategies
├── routing/                   Auto model/agent selection
├── memory/                    Cross-session strategy learning
├── prompts/                   Orchestrator system prompts
├── mcp/                       MCP server (stdio transport)
├── ui/                        CLI UI (onboarding, spinner, dashboard)
└── viewer.ts                  Trajectory TUI + DAG viewer
```

## Development

```bash
npm install                    # Install deps
npx tsx src/main.ts --dir .    # Run in dev mode
npm run build                  # Compile TypeScript
npm test                       # Run tests
```

---

## Attribution

The MCP execution layer is derived from [swarm-code](https://github.com/kingjulio8238/swarm-code) by [@kingjulio8238](https://github.com/kingjulio8238), based on the Recursive Language Model ([arXiv:2512.24601](https://arxiv.org/abs/2512.24601)), licensed under MIT. ContextOS extends it with:

- Native TypeScript `node:vm` sandbox (no Python 3 dependency)
- Dynamic context-aware skill loading from `.agents/` directory
- Security hardening (secret filtering, path traversal blocking, prompt injection scanning)
- Multi-provider support (Anthropic, OpenAI, Google, OpenRouter, Groq, Ollama)

## License

MIT
