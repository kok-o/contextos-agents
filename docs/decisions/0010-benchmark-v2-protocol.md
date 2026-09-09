# ADR-010: Benchmark v2 Protocol and Verifiable Evaluation Harness

## Status
Accepted

## Context
Early benchmarks for ContextOS relied on synthetic static token counts or manual sampling, leaving claims regarding token savings (up to 70-80%), context compression, and routing accuracy unverifiable across real-world workloads. Furthermore, without reproducible evaluation datasets and verifiable execution harnesses, regressions in skill resolution and prompt efficiency could not be systematically caught.

## Decision
Establish the **Benchmark v2 Protocol** as an automated, reproducible evaluation system:
1. **Verifiable Corpus**: Standardized task suites across diverse project architectures (monorepos, polyglot backends, modern frontend frameworks).
2. **Deterministic Baseline vs ContextOS Comparison**: Execute identical tasks with unmanaged raw context versus ContextOS manifest-driven compiled context.
3. **Automated Metric Instrumentation**: Directly measure token consumption (input/output/cache hits), context bloat ratio, resolution latency, and test pass rate.
4. **Reproducible CLI Harness**: Expose benchmark execution via `contextos benchmark run` with output artifacts formatted for automated regression checks in CI.

## Alternatives Considered
- *Synthetic Token Math*: Calculating theoretical token limits without running actual agent workflows. Rejected because it fails to capture LLM degradation and hallucination rates.
- *Third-party Benchmark Suites Only (e.g. SWE-bench)*: Valuable for high-level problem solving, but SWE-bench does not measure context optimization or skill selection efficiency directly.

## Trade-offs
- Running real LLM agent benchmarks in CI incurs compute and API token costs.
- Provides mathematically sound, auditable proof for enterprise claims regarding cost reduction and prompt accuracy.

## Impact
- Powers automated claim validation in `ENTERPRISE_ROADMAP.md` and marketing materials.
- Ensures performance and prompt compression invariants are maintained across releases.
