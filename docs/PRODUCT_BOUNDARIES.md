# ContextOS Product Boundaries

To ensure stability and secure deployments, the ContextOS project is strictly separated into different maturity boundaries. Features in Experimental or Labs stages are not included in the default `contextos-agents` npm package.

## 🟢 Stable (Core)

These components are production-ready, strictly versioned, and guaranteed for backwards compatibility. They form the `contextos-agents` root package.

*   **Manifest & Resolver Engine:** The dependency resolution and token-budget planning engine.
*   **Adapter Generation:** Compilers that produce `.cursorrules`, Claude Code config, Copilot instructions, etc.
*   **Lockfile & Validation (Drift Detection):** Generation of deterministic lockfiles and CI quality gates (`contextos validate`).
*   **Core Commands:** `init`, `export`, `resolve`, `doctor`, `watch`.

## 🟡 Beta (MCP Bridge)

These components are feature-complete but their APIs (specifically MCP schemas) may undergo minor changes. They are distributed via the separate `@contextos/mcp` package.

*   **Read-Only MCP Server:** Tools for agents to read project status (`contextos_resolve`, `contextos_explain`, `contextos_status`).
*   **Interactive CLI Framework:** Foundations for interactive shells, though not recommended for automated CI use.

## 🟠 Experimental (Runtime)

These components handle execution and mutation. They carry security implications and should only be used in trusted repositories or local environments with explicit opt-in flags.

*   **Git Worktree Isolation:** Spawning and managing parallel `.swarm-worktrees/`.
*   **Host Agent Execution:** Launching Claude Code, Codex, or OpenCode as subprocesses.
*   **Mutating MCP Tools:** `contextos_delegate`, `contextos_merge`, `contextos_diff`.
*   **OCI Verification Sandbox:** Docker-based execution testing (currently lacking cross-platform stability guarantees).

## 🔴 Labs (Deprecated / Under Research)

These components have been removed from standard distribution or are actively being researched. They should not be relied upon.

*   **Autonomous Swarm Orchestration:** Fully self-directed multi-agent routing.
*   **Recursive Language Models (RLM):** Self-improving episodic memory trees.
*   **Quantitative Benchmark Claims:** Token reduction marketing percentages (withheld until reproducible Benchmark v2 suite is finalized).
