---
name: subagent-orchestrator
description: >
  Subagent delegation and parallel coordination skill. Implements task decomposition, context hand-offs, blast-radius boundary isolation, and conflict-free merge synthesis.
---
# subagent-orchestrator

## Overview

Multi-agent coordination protocol inspired by [obra/superpowers](https://github.com/obra/superpowers). Enables a primary orchestrating agent to decompose complex workflows into isolated, parallel sub-tasks, delegate them with precise context boundaries, monitor execution, and synthesize outputs with zero merge conflicts.

## When to Use

Activate whenever:

- A task can be parallelized across distinct modules, services, or test suites.
- Long-running exploratory research or multi-file refactoring exceeds single-context budget.
- Running autonomous subagent workers for specialized roles (e.g. specialized QA tester, Security auditor, Docs generator).

## Rules & Patterns

### 1. The Blast Radius Boundary Rule

Before delegating any subagent task:

- **Zero File Overlap**: Each subagent MUST have a mutually exclusive list of target files. Two subagents must never be instructed to edit the same file concurrently.
- **Explicit Inputs & Outputs**: Provide only the minimal schema, contract, or mock that the subagent needs. Do not dump the entire workspace into subagent prompts.

### 2. The 4-Step Delegation Lifecycle

```
[ Orchestrator ]
       │
       ├─▶ 1. DECOMPOSE: Break into orthogonal tasks with non-overlapping file sets
       │
       ├─▶ 2. DISPATCH: Launch subagent with precise goal, constraints, and finish criteria
       │
       ├─▶ 3. AWAIT & VERIFY: Validate subagent output against its individual quality gate
       │
       └─▶ 4. SYNTHESIZE: Merge subagent results into the main branch and run global regression suite
```

### 3. Context Hand-off Specification

Every subagent dispatch prompt must contain:

1. **Target Objective**: Single, verifiable deliverable.
2. **Read-Only Context**: Files to consult as reference without modifying.
3. **Write Scope**: Exact file paths the subagent is permitted to create or modify.
4. **Completion Signal**: Explicit instruction to report `DONE` with test evidence or `BLOCKED` with reason.

---

## Code Examples

### Orchestrator Task Dispatch Template

```markdown
**Subagent Task: Order Validation Service**

- **Role**: `[ROLE: Senior Developer]`
- **Goal**: Implement Zod validation schema and unit tests for order payloads.
- **Write Scope**:
  - `src/services/order/validation.ts`
  - `tests/services/order/validation.test.ts`
- **Read-Only Reference**:
  - `src/types/order.ts`
- **Quality Gate**:
  - Run `npx vitest run tests/services/order/validation.test.ts`
  - All tests must pass with 100% coverage of validation rules.
- **Finish Criteria**:
  - Report exact test output and finish with `DONE`.
```

---

## Validation Checklist

- [ ] All delegated tasks have disjoint, non-overlapping file sets.
- [ ] Every subagent prompt has explicit read vs write boundaries.
- [ ] Subagent results verified individually before merging.
- [ ] Global regression suite executed across the entire repository after all subagents finish.

---

## Common Mistakes

- **Concurrent file collisions**: Assigning two subagents to modify the same route handler or lockfile.
- **Unbounded delegation**: Asking a subagent to "improve the codebase" without specific file limits.
- **Trusting without verification**: Assuming subagent code works without executing the test gate in the parent context.

---

## Integration Notes

- Integrates with `engineering-workflow` during the PLAN and BUILD phases.
- Works directly with `gstack-roles` to assign specific specialist personas to each subagent.
- Employs `ponytail-mindset` to keep subagent implementations minimal.

