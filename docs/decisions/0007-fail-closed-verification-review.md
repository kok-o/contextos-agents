# ADR-007: Fail-Closed Verification and Reviewer Quality Gates

## Status
Accepted

## Context
In autonomous coding and subagent execution (`contextos-mcp`), verification failures, timeouts, reviewer crashes, or missing test configurations historically fell back to `PASS`, allowing unverified code or hallucinated bugs to merge into target branches.

## Decision
Enforce strict **Fail-Closed** semantics across all runtime gates:
1. Only an actual, successful execution of tests can produce a `PASS` verdict.
2. Missing test commands are classified as `NOT_CONFIGURED` or `NOT_APPLICABLE` (with reason).
3. Reviewer network failures, process crashes, or invalid output format yield `UNAVAILABLE`, `ERROR`, or `MALFORMED` — never `PASS`.
4. Automated merges require explicit proof of work (`VerificationAttestation` and `ReviewAttestation`).

## Alternatives Considered
- *Permissive fallback*: Reduces friction during initial prototyping, but allows toxic code and security vulnerabilities to enter the codebase.
- *Strict human approval only*: Defeats autonomous subagent productivity.

## Trade-offs
- Subagents with broken tests or unavailable reviewer models cannot complete merges autonomously without resolving errors.
- Uncompromising code quality, zero hallucinated passes, production-ready code.

## Impact
- Integrated into `ReviewerGate`, `ThreadManager`, and `MergeCoordinator`.
