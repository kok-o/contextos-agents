# ContextOS Product Boundaries

To ensure stability and secure deployments, the ContextOS project is strictly separated into different maturity boundaries. Features in Experimental or Labs stages are not included in the default `contextos-agents` npm package.

## Core (stable 3.0.0)

Core 3.0.0 is published as `contextos-agents@3.0.0`. The reviewed archive and
acceptance evidence are described in the [stable release record](RELEASE_3.0.0.md).
MCP is excluded from core-only validation and publication; its maintenance scope
is unchanged.

These components form the versioned `contextos-agents` root package. Their contracts are checked by compiler and consumer tests; compatibility with a particular client loader requires client-specific verification.

* **Manifest & Resolver Engine:** The dependency resolution and skill graph planning engine.
* **Adapter Generation:** Compilers that produce Cursor MDC rules, native Claude rules and skills, Copilot instructions and other documented exports.
* **Lockfile & Validation (Drift Detection):** Generation of deterministic lockfiles and CI quality gates (`contextos validate`, `contextos gate`).
* **Staged Index Scanner & Safe Hooks:** Scanning Git index blobs for secrets and lazy stubs (`contextos scan`), and managing isolated pre-commit hooks (`contextos hook`).
* **Core Commands:** `init`, `compile`, `export` (including `--check`), `resolve`, `index`, `update`, `uninstall`, `doctor`, `watch`, `scan`, `hook`, `gate`, `recover`.

## Optional MCP package (frozen)

The optional `contextos-mcp` package has its own version and is not required to use core. Its supported bridge provides read-only inspection.

**Frozen.** Maintenance is limited to security and compatibility fixes. Existing experimental tools, runtime, swarm, orchestration and labs features are not expanded. Resuming MCP development requires a separate decision and a confirmed user scenario. Experimental runtime behavior is outside core's guarantees.

The packages have independent versions. Core has its own stable and RC workflows;
the standalone MCP maintenance workflow migration is separate work and does not
publish core. See [release instructions](RELEASE_PROCESS.md).

* **Read-Only MCP Server:** `contextos_status`, `contextos_compare`, and `contextos_diff` inspect existing session/thread state without initializing runtime worktrees. The bridge does not expose `contextos_resolve` or `contextos_explain`.
* **Interactive CLI Framework:** Foundations for interactive shells, though not recommended for automated CI use.

## Experimental (Runtime)

These components handle execution and mutation. They carry security implications and should only be used in trusted repositories or local environments with explicit opt-in flags. In-flight action firewalling (such as real-time tool-call interception, taint analysis, and socket blocking) is out-of-scope for the core compiler and is best handled by dedicated local action firewalls (such as Stroq).

* **Git Worktree Isolation:** Spawning and managing parallel `.swarm-worktrees/`.
* **Host Agent Execution:** Launching Claude Code, Codex, or OpenCode as subprocesses.
* **Mutating MCP Tools:** `contextos_delegate`, `contextos_merge`, `contextos_cleanup`, enabled with `--enable-runtime`.
* **OCI Verification Sandbox:** Docker-based execution testing (currently lacking cross-platform stability guarantees).

## Labs (Deprecated / Under Research)

These components have been removed from standard distribution or are actively being researched. They should not be relied upon.

* **Autonomous Swarm Orchestration:** Fully self-directed multi-agent routing.
* **Recursive Language Models (RLM):** Self-improving episodic memory trees.
* **Quantitative Performance Claims:** No performance percentages are part of the stable product promise.
