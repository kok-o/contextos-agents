---
name: engineering-workflow
description: >
  Senior engineering workflow skill inspired by Addy Osmani's agent-skills. Enforces the full development lifecycle: spec → plan → build → test → review → ship. AI must never write code before a spec and plan are approved.
---
# engineering-workflow

## Overview

Systematic 6-phase engineering pipeline (DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP) enforcing role declarations, atomic task execution, quality gates, regression prevention, and structured requirements elicitation.

## When to Use

Activate on all project tasks to orchestrate structured development, spec definition, architectural planning, and verification gates.

## Rules & Patterns

Inspired by [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) by Addy Osmani (Google Chrome) and [obra/superpowers](https://github.com/obra/superpowers).

### Core Principle

> **A junior writes code immediately. A senior writes a spec first.**  
> You are a senior. You never write code until the spec and plan are approved.

---

### The 6-Phase Development Pipeline

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
**Direct Build & Fast-Track Exception**: When the prompt/caller explicitly requests a standalone implementation, declares `[PHASE: Build]`, or requests routine operational/maintenance tasks (git operations, version bumps, typo fixes, small config tweaks, diagnostic checks), proceed directly to execution without conversational approval pauses.

---

### Phase 1: DEFINE — /spec

**Auto-activates → `[ROLE: Product Manager]`**

Turn vague intent into a precise, executable specification.

#### Step 1.1: The Interview Protocol (`interview-me`)

Before writing the spec, if there is ambiguity, high blast radius, or multiple architectural paths, stop and ask the user **one question at a time** (or up to 2 tightly coupled questions):

1. **Clarify Business Intent**: What user problem are we solving? What is explicitly out of scope?
2. **Clarify Constraints**: Runtime versions, database engines, performance bounds.
3. **Clarify Edge Cases**: What happens on offline state, empty lists, unauthorized requests?

#### Step 1.2: Spec Template

```markdown
## Feature Spec: [Feature Name]

### Why (Problem)
[What pain does this solve? Who has it? How often?]

### Scope (What's In / Out)

**In-Scope**:
- [Specific item 1]
- [Specific item 2]

**Out-of-Scope**:
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

### Phase 2: PLAN — /plan

**Auto-activates → `[ROLE: Architect]`**

Break the spec into atomic, independently testable tasks.

#### Thin Vertical Slices (`incremental-implementation`)

Organize tasks as **Thin Vertical Slices** rather than horizontal layers:

- **Bad (Horizontal)**: Task 1: All DB migrations. Task 2: All API routes. Task 3: All UI components. (Nothing works until step 3).
- **Good (Vertical Slices)**: Slice 1: Minimal DB table + minimal API + minimal UI button end-to-end. Verify and commit. Slice 2: Add validation + edge cases. Slice 3: Polish UI & telemetry.

#### Plan Rules

- Each task must be **completable in < 2 hours** of focused work.
- Each task must be **independently testable**.
- Tasks must be **ordered by dependency** (blocking tasks first).
- Each task gets a **test requirement** — no task without a test.

#### Plan Template

```markdown
## Implementation Plan: [Feature Name]

### Tasks

**Task 1: [Slice 1 Name]** (est. 30min)
- What: [Specific implementation detail]
- Files: [file1.js, file2.js]  
- Test: [How will you verify this works?]
- Blocked by: [nothing / Task N]

**Task 2: [Slice 2 Name]** (est. 45min)
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

### Phase 3: BUILD — /build

**Auto-activates → `[ROLE: Senior Developer]`**

Implement one task at a time. Commit after each task.

#### Build Rules

1. **One task per commit** — atomic, descriptive commit messages.
2. **Write the test FIRST** (TDD — red-green-refactor).
3. **No dead code** — if it's not tested, it's not shipped.
4. **No TODOs in committed code** — resolve or create a tracked issue.
5. **Read before writing** — understand the surrounding code before changing it.
6. **Limit the blast radius** — modify ONLY the files explicitly listed in the current task's plan. Do NOT rewrite adjacent components, hooks, or utilities unless strictly required AND approved.

#### Commit Message Format

```text
type(scope): short description (max 72 chars)

- Detail 1
- Detail 2

Refs: #issue-number
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

---

### Phase 4: VERIFY — /test

**Auto-activates → `[ROLE: QA Lead]`**

Tests are proof, not an afterthought.

#### Test Strategy by Code Type

**Logic & Services (TDD)**:

```text
1. RED:      Write a failing test for the next small behavior
2. GREEN:    Write the minimum code to make it pass
3. REFACTOR: Clean up without breaking tests
4. REPEAT
```

**UI Components & User Flows (BDD)**:

For complex React components, prioritize testing _user behavior_ over internal state:

- Use **React Testing Library** (`userEvent`, `screen.getByRole`) — test what the user sees.
- Use **Playwright** for critical user flows (login, checkout, form submit).
- Do NOT test implementation details (internal state, private methods, component structure).
- Focus on: "When user clicks X, does Y appear?" not "Does `useState` hold the right value?"

```tsx
// [GOOD] BDD: Test behavior
test("shows error when email is invalid", async () => {
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
});
```

#### Test Quality Gates

Before moving to Review, verify:

- [ ] All new code has tests
- [ ] Tests are meaningful (not just coverage theater)
- [ ] Edge cases are covered (null, empty, overflow, unauthorized)
- [ ] Tests fail when the implementation is broken (anti-regression)
- [ ] Test names are readable: `it("returns 404 when user not found")`

---

### Phase 5: REVIEW — /review

**Auto-activates → `[ROLE: Staff Engineer]` + `[ROLE: Senior Designer]` for UI tasks**

Review before merging. Always.

#### Subagent / Peer Code Review Protocol

Inspired by [obra/superpowers](https://github.com/obra/superpowers):

1. **Self-Review First**: The implementer runs git diff and verifies against the original acceptance criteria.
2. **Review Checklist**:
   - **Correctness**: Does it do what the spec says? Are all criteria met?
   - **Architecture**: Single Responsibility, DRY without premature abstraction, no business logic in API routes.
   - **Security**: No secrets hardcoded, inputs validated via Zod/schemas, auth checked before data access.
   - **Performance**: No N+1 queries, expensive operations cached, sets paginated.
   - **Design**: If UI, passes `impeccable-design` quick audit (typography, colors, spacing, animations).

---

### Phase 5.5: SIMPLIFY — /simplify

**Auto-activates → `[ROLE: Staff Engineer]` (Ponytail Mindset)**

Before merging, ruthlessly simplify:

1. Did we introduce abstractions that are only used once? (Inline them).
2. Can 3 lines of standard JavaScript replace a 50-line custom utility?
3. Is any configuration or generic handler premature? (YAGNI).
4. Is the code obvious to a mid-level engineer without reading a documentation manual?

---

### Phase 6: SHIP — /ship

**Auto-activates → `[ROLE: Release Engineer]`**

Only ship when all gates are green.

#### Pre-Ship Checklist

- [ ] All tests pass in CI
- [ ] No lint errors
- [ ] Feature works in staging environment
- [ ] Docs updated (README, API docs, changelogs)
- [ ] Breaking changes documented
- [ ] Rollback plan exists
- [ ] Vercel Preview Deployment is successful and manually verified
- [ ] Core Web Vitals pass in preview (LCP < 2.5s, CLS < 0.1, INP < 200ms)

#### Operational Self-Improvement

Before completing a workflow, review the session for durable learnings. Write them to `.agents/learnings.md`. If no durable learning occurred, state "No durable learnings this session" in your final output.

---

## Code Examples

### Vertical Slice Example

```javascript
// Slice 1: Minimal functional endpoint
// POST /api/v1/projects -> creates project with basic validation
import { z } from 'zod';
import { projectService } from '@/services/project';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional()
});

export async function POST(req) {
  const session = await auth();
  if (!session?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = CreateProjectSchema.parse(body);
  const project = await projectService.create({ ...parsed, userId: session.userId });

  return Response.json(project, { status: 201 });
}
```

---

## Validation Checklist

- [ ] Specification exists with clear In-Scope and Out-of-Scope boundaries.
- [ ] Implementation plan broken down into vertical tasks < 2 hours each.
- [ ] Tests written before implementation (TDD/BDD).
- [ ] Code reviewed against correctness, security, performance, and design gates.
- [ ] Simplification ladder executed before shipping.

---

## Common Mistakes

- **Writing code before approval**: Skipping `/spec` or `/plan` in interactive sessions.
- **Horizontal task splitting**: Building all DB models first without verifying end-to-end integration.
- **Premature refactoring**: Changing unrelated adjacent code during a feature task.
- **Ignoring non-happy paths**: Testing only 200 OK responses while ignoring 400, 401, 404, 500 scenarios.

---

## Integration Notes

- Integrates with `gstack-roles` for automated role switching across all 6 phases.
- Triggers `ponytail-mindset` during the BUILD and SIMPLIFY phases.
- Hands off to `impeccable-design` for UI quality review.
- Coordinates with `security` during Phase 5 for pre-merge compliance.

---

## Completion Status Protocol

When completing a task or workflow, you must explicitly report your final status as the last part of your output:

- **DONE** — completed with evidence.
- **DONE_WITH_CONCERNS** — completed, but list concerns.
- **BLOCKED** — cannot proceed; state blocker and what was tried.
- **NEEDS_CONTEXT** — missing info; state exactly what is needed.


<!-- Source: EXAMPLES.md -->

# engineering-workflow Examples — Anti-patterns vs ContextOS Standard

## Example 1: Handling a New Feature Request

### Anti-pattern: Jumping Straight to Code

```text
User: "Add a user referral system."
Agent: Immediately creates src/referral.js, starts writing database queries, guesses schema,
and misses requirements like rate limiting, expiry dates, and fraud prevention.
```

### Best practice: ContextOS Standard (DEFINE -> PLAN -> BUILD)

```markdown
[DOMAIN: Full-Stack] [PHASE: Define] [ROLE: Product Manager]
Skills loaded: engineering-workflow, interview-me

## Feature Spec: User Referral System
### Why (Problem)
Increase user acquisition through organic word-of-mouth incentives.

### Scope
In-Scope:
- Unique referral code generation per registered user
- Referral code attribution on signup
- Credit reward trigger after first completed purchase
Out-of-Scope:
- Multi-tier MLM rewards
- Cash payout integrations

### Acceptance Criteria
- [ ] Given a registered user, when visiting /referrals, then unique code is displayed.
- [ ] Given a new user with code, when signing up, then referrer_id is stored with status 'pending'.
```

---

## Example 2: Atomic Task Execution in PLAN Phase

### Anti-pattern: Monolithic Mega-Task

```text
Task: "Implement entire referral system end-to-end in one shot."
Result: 15 files modified simultaneously, uncompilable intermediate state, untestable diff.
```

### Best practice: ContextOS Standard (Atomic Tasks with Test Gate)

```markdown
[DOMAIN: Full-Stack] [PHASE: Plan] [ROLE: Architect]
Atomic Tasks:
1. Database migration: referrals and referral_rewards tables + indexes. (Test: Migration rollback & apply)
2. Domain service: ReferralService.createCode() and ReferralService.claimCode(). (Test: Unit tests)
3. API route: POST /api/referrals/claim with Zod validation. (Test: Supertest integration)
4. UI component: <ReferralCard /> with copy button. (Test: RTL component test)
```

<!-- Source: TROUBLESHOOTING.md -->

# engineering-workflow Troubleshooting & Common Mistakes

## 1. Premature Code Generation

- **Symptom**: Agent starts spitting out code blocks while the user is still clarifying requirements.
- **Root Cause**: Failure to enforce the IRON RULE of Phase 1 (DEFINE) and Phase 2 (PLAN).
- **Fix**: Halt code output immediately. Announce `[PHASE: Define]` or `[PHASE: Plan]` and provide the structured spec or task breakdown for user sign-off.

## 2. Blast Radius Creep

- **Symptom**: A simple bugfix in one module modifies 8 unrelated configuration and styling files.
- **Root Cause**: Missing isolation boundaries and speculative cleanup.
- **Fix**: Restrict edits strictly to files explicitly declared in the current atomic task's plan.

## 3. Unverified Claims of Completion

- **Symptom**: Agent reports "Task complete! Everything is working" without running tests or builds.
- **Root Cause**: Skipping Phase 4 (VERIFY).
- **Fix**: Always execute tests (`npm test`, validator, compiler) and quote actual terminal exit codes and outputs before declaring completion.
