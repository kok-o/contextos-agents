# ADR-011: Strategic Pivot to Deterministic Agent Rule Governance and CI Quality Gates

## Status
Accepted

## Context
Initial iterations of ContextOS explored aggressive prompt-budget slicing and token reduction under the hypothesis that smaller context windows lower API costs and reduce LLM degradation. 

However, foundational shifts in the LLM ecosystem and empirical evaluation revealed two key realities:
1. Modern frontier models (Gemini Flash/Pro, Claude 3.5/3.7, GPT-4o) support massive context windows (128k to 2M tokens) at significantly reduced inference costs. Artificial truncation or lossy slicing of engineering guidelines degrades instruction compliance and induces hallucinations, whereas complete, high-fidelity skill documents provide superior reasoning context.
2. The empirical 3-task benchmark pilot (documented in [BENCHMARK_PROTOCOL.md](../BENCHMARK_PROTOCOL.md)) demonstrated that adding structured domain skills incurs a small prompt token overhead rather than a reduction, and 3 tasks are statistically insufficient to make broad marketing claims about generic code generation accuracy.

At the same time, engineering teams face an acute, deterministic pain point: fragmented AI tooling. Developers within the same team simultaneously use Cursor, Claude Code, GitHub Copilot, Gemini/Antigravity, Zed, and Aider. Each tool requires its own proprietary configuration format (`.cursor/rules/*.mdc`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.agents/skills/`, `.zed/rules.md`), leading to configuration drift, conflicting instructions, and unvetted AI slop entering codebases.

## Decision
ContextOS officially pivots its core value proposition and product roadmap:

1. **Abandon Token Reduction as a Value Proposition**: We discontinue marketing ContextOS as a token-saving prompt compressor. We recognize that high-quality, comprehensive skill context is fundamentally more valuable than artificially truncated prompts.
2. **Double Down on Deterministic Cross-Agent Governance**: ContextOS is positioned as the single version-controlled source of engineering truth for multi-agent teams ("Babel / Terraform for AI Agent Rules"):
   - Author engineering skills once in standard Markdown.
   - Deterministically compile to native configuration formats across all supported agents (`contextos export all`).
   - Eliminate configuration drift through lockfile v2 provenance and dual-hash verification.
3. **Elevate CI Quality Gates and Guardrails**: Focus development on deterministic CI enforcement (`contextos validate` / GitHub Actions) to prevent rule drift and block commits containing unvetted placeholders (`// TODO`), secret leaks, and write-scope boundary violations (Milestone 11 verification).
4. **Reframe Benchmark Role**: The evaluation harness in `benchmarks/` is repositioned as an internal regression test for skill authors to verify prompt efficacy, rather than a commercial proof-of-value marketing tool.

## Alternatives Considered
- *Aggressive Token Slicing and Dynamic Summarization*: Using an intermediary LLM to summarize skills before prompt injection. Rejected: introduces latency, API costs, non-determinism, and semantic loss.
- *Large-Scale Scientific SWE-Bench Scaling (30-50 tasks)*: Rejected as primary product driver: prohibitive API expenses with high statistical variance that depreciates with every upstream model release.
- *Full Project Sunsetting*: Rejected: the core compiler, lockfile v2, and multi-agent adapters are technically sound, stable, and pass 381 unit and integration tests.

## Trade-offs
- Eliminates claims of direct API dollar savings from prompt compression.
- Requires updating product documentation and README to emphasize team orchestration and CI drift prevention over token optimization.

## Impact
- Product positioning aligns with the verified capabilities of the codebase.
- Engineering teams gain a reliable, deterministic toolchain to govern heterogeneous AI agents without manual overhead or configuration drift.
