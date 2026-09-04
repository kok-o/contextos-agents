---
name: gemini-precision
description: >
  High-precision engineering and execution guardrails optimized for Google Gemini models.
  Enforces zero-assumption file inspection, complete non-lazy implementations, surgical
  blast-radius containment, and mandatory proof-of-work execution.
---

# gemini-precision

## Overview

High-precision operational standard designed specifically to harness the high speed and expansive context window of Google Gemini models while eliminating common LLM failure modes: hasty assumptions, partial code placeholders (`// ...`), unverified assertions, and scope creep.

## When to Use

Activate whenever:

- Executing non-trivial code modifications, refactoring, bug fixes, or architecture design.
- The user requires maximum rigor, reliability, and precision from Gemini.
- Handling complex multi-file changes where accidental side-effects must be zero.

## Rules & Patterns

### 1. The Read-Before-Write Invariant (Zero Assumptions)

**Never write code based on assumptions about the codebase.**

- Before modifying a function or creating an integration, **always inspect the actual files** using `view_file` or `grep_search`.
- Check the exact runtime, framework version, and installed dependencies (e.g. React 19 vs 18, Next.js 15 vs 14, Tailwind v4 vs v3, Zod vs Joi) in `package.json` or config files before generating code.
- Verify imported symbol names and parameter signatures directly from source files.

### 2. The Zero-Placeholder Invariant (Complete Code Only)

**Never produce lazy, incomplete, or stubbed output.**

- ❌ **Forbidden**:
  - `// TODO: implement logic here`
  - `// ... rest of existing code ...`
  - `// ... existing imports ...`
  - Mock stub returns when real integration is required
- ✅ **Mandatory**:
  - Provide **100% complete, fully-implemented, compilable, and drop-in ready** code.
  - When replacing a block of code, include all necessary imports, type definitions, and edge-case handling.

### 3. The Proof-of-Work Invariant (Verification Before Completion)

**Never claim a task is complete without tool-verified evidence.**

- When modifying code or configuration:
  1. Run the project validator or compiler (`node .agents/ctx.js validate`, `tsc --noEmit`, etc.).
  2. Run unit and integration tests (`npm test`, `pytest`, etc.).
  3. Run linter and formatting checks (`npm run lint:md`, `eslint`, etc.).
- If a test or validation fails, do not guess: read the exact error trace, fix the root cause, and re-run until green.

### 4. Surgical Blast Radius Containment

**Modify ONLY what is strictly necessary.**

- Keep edits isolated to the exact lines, functions, and files specified in the plan.
- Do not reformat, reorder, or alter indentation of unrelated code blocks.
- Preserve existing comments, docstrings, and project conventions unless explicitly asked to change them.

### 5. Ponytail Minimalism (YAGNI)

- Prioritize native platform APIs (standard library, browser built-ins) over new npm/pip packages.
- Follow the "Rule of Three": inline on first use, duplicate cleanly on second, abstract only on third.
- Keep solutions obvious to a mid-level developer without requiring multi-layered wrapper classes.

---

## Code Examples

### Bad (Lazy Model Output) vs Good (Precision Model Output)

**❌ Bad (Lazy AI Output)**:

```javascript
// user.service.js
export async function updateUser(id, data) {
  // ... existing auth check ...
  // TODO: validate data with zod
  return await db.user.update({ where: { id }, data });
}
```

**✅ Good (Gemini Precision Output)**:

```javascript
// user.service.js
import { z } from 'zod';
import { db } from '../lib/db.js';
import { ValidationError, UnauthorizedError } from '../errors/index.js';

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
}).strict();

export async function updateUser(id, data, session) {
  if (!session?.userId || session.userId !== id) {
    throw new UnauthorizedError('Access denied: cannot update another user');
  }

  const parsed = UpdateUserSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError('Invalid update payload', parsed.error.format());
  }

  return await db.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, updatedAt: true }
  });
}
```

---

## Validation Checklist

- [ ] Inspected active codebase files before writing code.
- [ ] Delivered 100% complete code with zero `// TODO` or `// ...` placeholders.
- [ ] Ran automated tests and validation with green status.
- [ ] Confined changes to the minimal required blast radius.
- [ ] Reported final status with verifiable evidence.

---

## Common Mistakes

- **Assuming API contracts**: Guessing function parameters without opening the file.
- **Premature completion**: Declaring "fixed" without running the test suite.
- **Uncontrolled refactoring**: Rewriting adjacent components while fixing a 1-line bug.

---

## Integration Notes

- Pairs with `engineering-workflow` to enforce the 6-phase pipeline.
- Enforces the 7-rung ladder of `ponytail-mindset`.
- Acts as the baseline behavioral guardrail across all Gemini and Antigravity operations.
