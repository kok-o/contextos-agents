# ContextOS — engineering-workflow

> >

# engineering-workflow

## Overview

Systematic 6-phase engineering pipeline (DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP) enforcing role declarations, atomic task execution, quality gates, and regression prevention.

## When to Use

Activate on all project tasks to orchestrate structured development, spec definition, architectural planning, and verification gates.

## Rules & Patterns

Inspired by [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) by Addy Osmani (Google Chrome).

## Core Principle

> **A junior writes code immediately. A senior writes a spec first.**  
> You are a senior. You never write code until the spec and plan are approved.

---

## The 6-Phase Development Pipeline

```
  DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
   /spec          /plan          /build        /test         /review       /ship

[ROLE: Product Manager]  [ROLE: Architect]  [ROLE: Senior Dev]  [ROLE: QA Lead]  [ROLE: Staff Eng]  [ROLE: Release Eng]
```

**IRON RULE**: In interactive development, no phase can be skipped and no code is written before `/plan` is approved.
**Direct Build Exception**: When the prompt/caller explicitly requests a standalone implementation, or declares `[PHASE: Build]`, execute the BUILD phase directly and deliver the complete, self-contained production code without conversational pauses.

---

## Phase 1: DEFINE — /spec

### Auto-activates → `[ROLE: Product Manager]`

Turn vague intent into a precise, executable specification.

### Spec Template

```markdown
## Feature Spec: [Feature Name]

### Why (Problem)
[What pain does this solve? Who has it? How often?]

### Scope (What's In / Out)
### 
- [Specific thing 1]
- [Specific thing 2]

### 
- [Thing we're NOT doing and why]

### Technical Approach
[Read the relevant code. Understand what changes where.]
Files affected:
- `src/X.js` — [what changes]
- `src/Y.js` — [what changes]

### Acceptance Criteria
- [ ] Given [context], when [action], then [result]
- [ ] Given [context], when [action], then [result]

### Open Questions
- [Unresolved decision 1]
- [Unresolved decision 2]
```

---

## Phase 2: PLAN — /plan

### Auto-activates → `[ROLE: Architect]`

Break the spec into atomic, independently testable tasks.

### Plan Rules

- Each task must be **completable in < 2 hours** of focused work
- Each task must be **independently testable**
- Tasks must be **ordered by dependency** (blocking tasks first)
- Each task gets a **test requirement** — no task without a test

### Plan Template

```markdown
## Implementation Plan: [Feature Name]

### Tasks

**Task 1: [Name]** (est. 30min)
- What: [Specific implementation detail]
- Files: [file1.js, file2.js]  
- Test: [How will you verify this works?]
- Blocked by: [nothing / Task N]

**Task 2: [Name]** (est. 45min)
- What: [Specific implementation detail]
- Files: [file3.js]
- Test: [Test description]
- Blocked by: Task 1

### Risk Assessment
- [Risk 1]: [Mitigation]
- [Risk 2]: [Mitigation]

### STOP — Awaiting Approval
Do not proceed to BUILD until this plan is approved.
```

---

## Phase 3: BUILD — /build

### Auto-activates → `[ROLE: Senior Developer]`

Implement one task at a time. Commit after each task.

### Build Rules

1. **One task per commit** — atomic, descriptive commit messages
2. **Write the test FIRST** (TDD — red-green-refactor)
3. **No dead code** — if it's not tested, it's not shipped
4. **No TODOs in committed code** — resolve or create a tracked issue
5. **Read before writing** — understand the surrounding code before changing it
6. **Limit the blast radius** — modify ONLY the files explicitly listed in the current task's plan. Do NOT rewrite adjacent components, hooks, or utilities unless strictly required AND approved. If you spot a problem in nearby code, file it as a separate task, do not fix it inline.

### Commit Message Format

```
type(scope): short description (max 72 chars)

- Detail 1
- Detail 2

Refs: #issue-number
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

---

## Phase 4: VERIFY — /test

### Auto-activates → `[ROLE: QA Lead]`

Tests are proof, not an afterthought.

### Test Strategy by Code Type

###

```
1. RED:      Write a failing test for the next small behavior
2. GREEN:    Write the minimum code to make it pass
3. REFACTOR: Clean up without breaking tests
4. REPEAT
```

###

For complex React components, prioritize testing _user behavior_ over internal state:

- Use **React Testing Library** (`userEvent`, `screen.getByRole`) — test what the user sees
- Use **Playwright** for critical user flows (login, checkout, form submit)
- Do NOT test implementation details (internal state, private methods, component structure)
- Focus on: "When user clicks X, does Y appear?" not "Does `useState` hold the right value?"

```tsx
// [GOOD] BDD: Test behavior
test("shows error when email is invalid", async () => {
  render(<LoginForm />)
  await userEvent.type(screen.getByLabelText("Email"), "not-an-email")
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }))
  expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
})

// [BAD] Brittle: Testing internal implementation
test("sets error state to true", () => {
  const { result } = renderHook(() => useLoginForm())
  act(() => result.current.setError(true))
  expect(result.current.error).toBe(true)
})
```

### Test Hierarchy (Most to Least Valuable)

```
For logic/services:  Unit Tests → Integration Tests
For UI/flows:        RTL (component) → Playwright (e2e critical paths)
Skip:                Snapshot tests (brittle, low signal)
```

### Test Quality Gates

Before moving to Review, verify:

- [ ] All new code has tests
- [ ] Tests are meaningful (not just coverage theater)
- [ ] Edge cases are covered (null, empty, overflow, unauthorized)
- [ ] Tests fail when the implementation is broken (anti-regression)
- [ ] Test names are readable: `it("returns 404 when user not found")`

---

## Phase 5: REVIEW — /review

### Auto-activates → `[ROLE: Staff Engineer]` + `[ROLE: Senior Designer]` for UI tasks

Review before merging. Always.

### Code Review Checklist

###

- [ ] Does it do what the spec says?
- [ ] Are all acceptance criteria met?
- [ ] Edge cases handled?

###

- [ ] Single Responsibility: each function does one thing
- [ ] DRY: no logic duplicated across 3+ places
- [ ] No magic numbers (use named constants)
- [ ] Error handling: all async operations have try/catch or `.catch()`
- [ ] Business logic is NOT in API route handlers — it lives in services/use-cases

###

- [ ] No secrets hardcoded
- [ ] User input is validated and sanitized
- [ ] SQL uses parameterized queries (no string concatenation)
- [ ] Auth checks before data access

###

- [ ] No N+1 query patterns
- [ ] Expensive operations are cached or async
- [ ] Large data sets are paginated

**UI/Design** (if applicable — activate `impeccable-design` skill checklist)

- [ ] Passes impeccable-design Quick Audit (typography, colors, spacing, animations)

---

## Command Workflows

| Command | Auto-Role | Purpose & Action |
|:---|:---|:---|
| **`/spec`** | `[ROLE: Product Manager]` | Interrogate requirements, define In-Scope/Out-of-Scope, write testable acceptance criteria. |
| **`/plan`** | `[ROLE: Architect]` | Decompose spec into atomic tasks (< 2 hrs each), define affected files and test requirements. |
| **`/build`** | `[ROLE: Senior Developer]` | Implement task-by-task using TDD, minimal blast radius, atomic commits. |
| **`/test`** | `[ROLE: QA Lead]` | Run unit, integration, and UI behavioral tests covering all edge cases. |
| **`/simplify`** | `[ROLE: Staff Engineer]` | Run the 7-rung ladder to strip over-engineering, dead abstractions, and premature flexibility. |
| **`/review`** | `[ROLE: Staff Engineer + Senior Designer]` | Execute the 5-axis quality gate (correctness, architecture, security, performance, design). |
| **`/ship`** | `[ROLE: Release Engineer]` | Final validation: clean CI, zero lint errors, updated docs, and verified rollback plan. |

---

## Phase 5.5: SIMPLIFY — /simplify

### Auto-activates → `[ROLE: Staff Engineer]` (Ponytail Mindset)

Before merging, ruthlessly simplify:

1. Did we introduce abstractions that are only used once? (Inline them).
2. Can 3 lines of vanilla JavaScript replace a 50-line custom utility?
3. Is any configuration or generic handler premature? (YAGNI).
4. Is the code obvious to a mid-level engineer without reading a documentation manual?

---

## Phase 6: SHIP — /ship

### Auto-activates → `[ROLE: Release Engineer]`

Only ship when all gates are green.

### Pre-Ship Checklist

- [ ] All tests pass in CI
- [ ] No lint errors
- [ ] Feature works in staging environment
- [ ] Docs updated (README, API docs, changelogs)
- [ ] Breaking changes documented
- [ ] Rollback plan exists
- [ ] Vercel Preview Deployment is successful and manually verified
- [ ] Core Web Vitals pass in the preview environment (LCP < 2.5s, CLS < 0.1, INP < 200ms)

### Operational Self-Improvement (Required)

Before completing a workflow, you must review the session for durable learnings (project quirks, command fixes, pitfalls, or patterns that save time).
Write these learnings to `.agents/learnings.md`. Do not log obvious facts or one-time transient errors. If no durable learning occurred, state "No durable learnings this session" in your final output.

---

## Anti-Patterns to Never Do

| Anti-Pattern | Why It's Wrong | What To Do Instead |
| --- | --- | --- |
| "I'll just write the code and we'll see" | Creates unmaintainable scope creep | Write spec first |
| Writing code in Phase 1 (DEFINE) | Premature implementation | Stay in spec mode |
| Skipping tests because "it's obvious" | Bugs hide in "obvious" code | Write the test anyway |
| Giant commits | Impossible to review or revert | Atomic commits per task |
| Fixing bugs while implementing features | Context switching, hidden changes | Separate branches/commits |
| "I'll add tests later" | Later never comes | TDD: tests first |
| Refactoring adjacent code mid-task | Expands blast radius silently | Separate task/PR for refactors |
| Snapshot tests as primary UI test | Brittle, tests implementation not behavior | Use RTL + Playwright instead |


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.

## Completion Status Protocol

When completing a task or workflow, you must explicitly report your final status as the last part of your output:
- **DONE** — completed with evidence.
- **DONE_WITH_CONCERNS** — completed, but list concerns.
- **BLOCKED** — cannot proceed; state blocker and what was tried.
- **NEEDS_CONTEXT** — missing info; state exactly what is needed.

