# ContextOS Public Roadmap

This document outlines the strategic evolution, architectural milestones, and planned capabilities for **ContextOS**.

---

## Current Status: v2.2.0 (Stable Core)

- **Deterministic Context Compilation**: Zero-dependency compiler generating optimized instructions for Cursor (`.cursor/rules`), Claude Code (`CLAUDE.md`), Gemini (`GEMINI.md`), GitHub Copilot (`copilot-instructions.md`), Aider (`.aider.conf.yml`), and Zed (`.zed/rules.md`).
- **Autonomous Offline Catalog**: 36 verified engineering skills distributed locally within `.agents/catalog/skills` for offline installation.
- **Stack Presets & Bulk Installation**: Quick bootstrapping via `--preset frontend`, `--preset backend`, `--preset devops`, and `--all` flag.
- **In-Process CI Quality Gate**: Automated drift verification (`contextos gate`) checking managed outputs against source skills in continuous integration.
- **Staged Git Security Scanner**: In-memory inspection (`contextos scan`) preventing leaks of credentials and unfinished lazy stubs (`// TODO`).
- **Pre-Commit Hook Governance**: Isolated Git hooks (`contextos hook install`) running non-destructive repository verification.

---

## Upcoming Milestones

### Milestone 1: Multi-Repository Governance (v2.3)
- **Central Policy Synchronization**: Support inheriting organization-wide baseline policies and corporate security standards from central repositories.
- **Selective Team Overrides**: Declarative inheritance layers enabling teams to extend organization standards with project-specific skills.
- **Enterprise Rule Registry**: Private registry endpoints for proprietary company skills and compliance rules.

### Milestone 2: Adaptive Context Engine (v2.4)
- **Dynamic Task-Scoped Subsets**: Automatic pruning of active rules based on task descriptions and modified files to minimize token overhead.
- **Model-Specific Token Optimizers**: Dynamic formatting adjustments tailored to specific context windows (e.g. Gemini Flash, Claude Sonnet, GPT-4o).
- **Workspace Evidence Graph Extensions**: Multi-language dependency tree inspection for Python (poetry, uv), Go (go.mod), and Rust (Cargo.toml).

### Milestone 3: Ecosystem & Extensibility (v3.0)
- **Interactive Skill Generator**: Scaffolding CLI for community-authored skills with automatic schema validation and example test suites.
- **IDE Extensions**: Native extensions for VS Code and JetBrains providing real-time drift visual indicators in the editor status bar.
- **Community Plugin Hub**: Decentralized skill discovery and verified publisher signatures.

---

## Contributing & Feedback

Have ideas, feature requests, or suggestions for the roadmap?
- Open a [GitHub Discussion](https://github.com/kok-o/contextos-agents/discussions) to propose new capabilities.
- Submit a pull request following our [Contributing Guide](../CONTRIBUTING.md).
