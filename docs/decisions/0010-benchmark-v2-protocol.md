# ADR-010: Benchmark v2 Protocol and Verifiable Evaluation Harness

## Status
Superseded as a description of the implemented benchmark. The current pilot is documented in [BENCHMARK_PROTOCOL.md](../BENCHMARK_PROTOCOL.md).

## Context
This decision recorded a target protocol. Historical numerical claims about token savings and routing accuracy were not supported by reproducible task-level evidence and have been invalidated in `benchmarks/claims.json`.

## Decision
The repository now implements a narrower pilot through `npm run benchmark`:

1. It sends paired prompts to a selected model API, or exports the prompts for a manual chat comparison.
2. Its three TypeScript tasks are evaluated by local compile/runtime checks.
3. ContextOS arms use the actual canonical resolver and installed skill documents from a fixed empty-workspace fixture.
4. API token usage is read from provider responses; manual chat counts are only imported when the UI exposes them.

The pilot does not implement the original broad corpus, multi-repository agent execution, context-bloat study, complete product runtime, CI claim validation, or an independently audited evaluator. See `docs/BENCHMARK_PROTOCOL.md` for the exact current scope and limitations.

## Alternatives Considered
- *Synthetic Token Math*: Calculating theoretical token limits without running actual agent workflows. Rejected because it fails to capture LLM degradation and hallucination rates.
- *Third-party Benchmark Suites Only (e.g. SWE-bench)*: Valuable for high-level problem solving, but SWE-bench does not measure context optimization or skill selection efficiency directly.

## Trade-offs
- API runs incur model costs and require an operator-supplied key.
- The current fixed task set is small and exploratory; repeated generations do not add task diversity.
- Prompt-context comparisons include the token overhead of the added ContextOS instructions.

## Impact
- Current reports are run-level evidence for this pilot only. They do not automatically validate claims or establish broad product effects.
- The invalidated historical evidence remains only as a governance tombstone so unsupported claims are not silently reintroduced.
