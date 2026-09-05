# context-os Examples — Anti-patterns vs ContextOS Standard

## Example 1: Project Lifecycle Management

### Anti-pattern: Ad-hoc Unstructured Development

```text
Coding -> Modifying DB -> Debugging -> Redesigning UI -> Changing Architecture
All in one unstructured stream of consciousness.
```

### Best practice: ContextOS Standard (Phase-Gated Development)

```text
Phase 1: DEFINE (PRD & Requirements)
Phase 2: PLAN (Atomic Tasks & ADRs)
Phase 3: BUILD (TDD & Minimalist Implementation)
Phase 4: VERIFY (Automated Test Proof)
Phase 5: REVIEW (Design QA & Code Review)
Phase 6: SHIP (Production Release)
```
