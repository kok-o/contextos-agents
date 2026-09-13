# ContextOS Product Positioning & ICP Governance

Status: CORE STABLE / MCP BETA / RUNTIME EXPERIMENTAL
Version: 2.0.0
Last Updated: 2026-09-13

---

## 1. Value Proposition

> **ContextOS is a deterministic context and policy compiler for supported AI coding agents.**
> It turns version-controlled engineering rules into focused, reproducible agent configuration and detects configuration drift in CI.

---

## 2. Ideal Customer Profiles (ICP)

### Primary ICP: Engineering Teams (5–100 Developers)
- **Profile**: Multi-engineer teams where developers use varied AI assistants (e.g., some on Cursor, some using Claude Code in terminal, some pairing with Antigravity / Gemini).
- **Core Pain**: Prompt drift, contradictory instructions, repetitive prompt pasting, accidental commits of unvetted AI slop or unreviewed changes.
- **Value**: Single source of truth in `.agents/`, deterministic compilation to all IDE-native formats, fail-closed automated verification.

### Secondary ICP: Platform / DX Teams & Solo Maintainers
- **Profile**: Platform engineers managing shared development standards across monorepos and microservices, or maintainers of high-integrity open-source projects.
- **Core Pain**: Enforcing architectural guidelines and test requirements across dozens of packages without bloating context windows.
- **Value**: Workspace-aware dependency graphs, atomic transaction rollback, and verifiable provenance.

---

## 3. Anti-ICP (Who ContextOS is NOT for)

- **Single-file users**: Individual developers who only ever use one IDE (e.g., Cursor only) and have a simple 20-line rules file that never changes.
- **Prompt-only tinkerers**: Users seeking prompt "magic" or prompt generators without reproducible code-level tests or CI pipelines.
- **Zero-tool projects**: Projects that do not use any AI coding tools or agentic pair programming.

---

## 4. Architectural Boundaries

| Layer | Responsibility | State & Mutability |
|---|---|---|
| **ContextOS Core** | Manifest validation, context resolution, profile management, adapter export, lockfile and drift checks. | Stable CLI and compiler for supported agent formats. |
| **MCP Server** | Read-only access to project context through MCP. | Separate package; beta. |
| **Runtime** | Task orchestration, worktree isolation, and execution sandbox integrations. | Experimental; outside the stable core contract. |
| **Context Catalog** | Built-in skills, references, and third-party plugins. | Versioned manifests and integrity verification. |

---

## 5. Non-Promises (Claim Governance)

To maintain absolute engineering integrity, ContextOS explicitly **does not promise**:
1. That Markdown prompts guarantee flawless code without runtime execution verification.
2. That Git worktrees alone represent an OS-level security boundary without container sandboxing.
3. That regex pattern matching proves semantic implementation completeness.
4. That reduced token context directly guarantees provider API cost reductions on complex reasoning models.
5. That ContextOS improves task execution for uncalibrated or hallucinating foundation models.

ContextOS does not make quantitative performance guarantees. Any future empirical claim must include a reproducible method and supporting evidence.
