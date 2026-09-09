# ADR-005: Resolver Evidence Precedence, Dependency Closures, and Conflict Policy

## Status
Accepted

## Context
Skill resolution in AI coding assistants must strike a delicate balance: providing sufficient context for complex tasks while preventing prompt bloat and context poisoning. Early resolvers had arbitrary skill count caps (e.g. maximum 4 skills) and could select conflicting skills (e.g. React alongside NestJS on a pure frontend component).

## Decision
Implement a canonical evidence-based resolution engine (`CanonicalResolver`):
1. **Evidence Weights**:
   - `explicit`: +100
   - `alias`: +80
   - `fileGlob`: +70
   - `nearestPackage`: +60
   - `keyword`: +40
   - `profile_required`: mandatory
   - `profile_preferred`: +20
   - `ambient`: +5
2. **Intent Precedence**: Direct prompt/task intent overrides passive ambient repository dependencies.
3. **Transitive Closures**: Mandatory dependencies (`requires`) are resolved recursively via topological sort and locked against budget eviction.
4. **Dynamic Token Budget**: Replace arbitrary skill count caps with a token budget planner (default 8,000 tokens).
5. **Conflict Policy**: Declared conflicts (`conflicts: [...]`) and active profile exclusions (`exclude_skills`) strictly suppress incompatible skills.

## Alternatives Considered
- *LLM-based meta-routing*: Unpredictable, introduces 1–3 seconds of latency, and burns tokens before the actual coding task begins.
- *Static skill tagging*: Fails in mixed monorepos and complex multi-framework projects.

## Trade-offs
- Requires meticulous trigger keyword tuning in skill manifests.
- Sub-5ms deterministic resolution, zero hallucinations, explainable scoring breakdown (`--explain`).

## Impact
- Powers both CLI `contextos resolve` and MCP tool `contextos_resolve`.
