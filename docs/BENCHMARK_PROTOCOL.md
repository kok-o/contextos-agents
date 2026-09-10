# ContextOS Benchmark v2 Protocol

This document defines the frozen Benchmark v2 protocol used to generate and verify marketing and technical claims in `benchmarks/claims.json`.

## Immutable Tasks & Dataset
- **Schema**: All benchmark tasks are versioned, immutable, and secured by SHA-256 hashes.
- **Contamination**: We actively control for data contamination. Benchmark tasks must not be part of the training sets for tested models.
- **Minimum Volume**: A pilot phase requires a minimum of 30 distinct tasks.

## Execution Harness
The execution harness compares four isolated evaluation arms:
1. **Vanilla**: Standard LLM prompt without any system context.
2. **Concise Checklist**: LLM provided with a minimal best-practices checklist.
3. **ContextOS Core**: LLM provided with ContextOS canonical adapter context.
4. **Full ContextOS**: LLM provided with Full ContextOS MCP, subagent orchestration, and sandboxed execution.

### Standardization Rules
- All arms must execute with identical model parameters (Temperature, Top-K).
- Retry rules and task inputs must be strictly identical across all arms.
- Environment provenance (engine versions, timestamps) must be recorded.

## Evaluators
- **Primary Metric**: Independently verified success (e.g., does the code compile, pass tests, and satisfy the prompt?).
- **Statistics**: All claims must publish 95% Confidence Intervals, paired deltas, and cost-per-verified-success metrics.
- **Human Review**: Blind, randomized human review is mandated for tasks lacking robust automated verification.

## Freeze & Release
- **Pilot Phase**: A pilot run is executed to validate the protocol. Negative results MUST be published.
- **Protocol Freeze**: After the pilot, the evaluation methodology and metrics are strictly frozen. Evaluators cannot be modified post-freeze without incrementing the protocol version.
- **Claim Generation**: `benchmarks/claims.json` is generated directly from the evidence bundle of the main run. No manual edits are allowed to the metrics.
