---
name: gemini-precision
description: >
  High-precision engineering and execution guardrails optimized for Google Gemini models. Enforces zero-assumption file inspection, complete non-lazy implementations, surgical blast-radius containment, and mandatory proof-of-work execution.
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
  4. Run staged security and quality scanner (`contextos scan --staged --enforce`).
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

### 6. Targeted Tool-Specific Modifications

**Prevent accidental code loss during file updates.**

- For existing files requiring localized updates (< 50% change), always prefer surgical targeted replacement chunks over destructive full-file rewrites.
- Never discard unrelated file sections, existing comments, or helper utilities.

### 7. Persistent Context & Plan Tracking

**Prevent context drift during multi-step tasks.**

- When an operation requires more than 3 sequential steps, write and maintain a persistent plan or checklist on disk.
- Never rely exclusively on volatile conversational memory for tracking complex multi-file refactorings.

### 8. Progressive Step Narration (Transparent Pair Programming)

**Eliminate the "black box" by narrating technical decisions.**

- Avoid executing long, silent chains of tool calls without user visibility.
- Provide a concise 1-2 sentence transparent status update before key operations:
  - State what was inspected or verified from the code.
  - State the architectural decision made and the immediate next action.
- Keep narration crisp and actionable without excessive verbosity.
- **Zero-Spam Constraint**:
  - ❌ **Forbidden**: Starting every intermediate step, tool call, or status update with domain/phase/role tags (e.g. `[DOMAIN: ...] [PHASE: ...] [ROLE: ...]`).
  - ✅ **Mandatory**: Declare role and phase strictly once at the start of a phase. Intermediate step updates must be clean, natural language sentences describing technical actions directly.
  - Do not narrate routine micro-inspections (single line reads or basic greps). Announce only meaningful task phases and decisions.

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
- [ ] Preserved existing code via targeted edits rather than full-file overwrites.
- [ ] Persisted multi-step task state and milestones to disk.
- [ ] Narrated progress with concise, transparent step-by-step updates.
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


<!-- Source: EXAMPLES.md -->

# gemini-precision Examples - Anti-patterns vs ContextOS Standard

## Example 1: Read-Before-Write Invariant (Zero Assumptions)

### Anti-pattern: Hallucinated Import and Signature

```typescript
// BAD: Assuming the module exists and export is a default function
import hashPassword from 'src/utils/crypto';
const hash = hashPassword(password);
```

### Best practice: ContextOS Standard (Inspected Active Codebase First)

```typescript
// GOOD: Inspected src/lib/auth.ts via view_file before writing code
import { hashSecret, ARGON2_CONFIG } from '../lib/auth.js';
const hash = await hashSecret(password, ARGON2_CONFIG);
```

---

## Example 2: Zero-Placeholder Invariant (Complete Code Only)

### Anti-pattern: Lazy Stubs and Ellipsis Comments

```typescript
// BAD: Emitting incomplete code with TODOs and ellipsis
export function processTransaction(tx: Transaction) {
  // TODO: validate transaction balance
  // ... rest of implementation stays here ...
  return { status: 'ok' };
}
```

### Best practice: ContextOS Standard (100% Drop-in Compilable)

```typescript
// GOOD: Fully implemented logic with complete error handling
export function processTransaction(tx: Transaction): TransactionResult {
  if (!tx.amount || tx.amount <= 0) {
    throw new ValidationError('Transaction amount must be positive');
  }
  if (tx.senderBalance < tx.amount) {
    throw new InsufficientFundsError(tx.senderId, tx.amount);
  }
  return {
    status: 'ok',
    transactionId: tx.id,
    newBalance: tx.senderBalance - tx.amount,
  };
}
```

---

## Example 3: Mandatory Proof-of-Work Invariant

### Anti-pattern: Claiming Task Complete Without Evidence

```text
BAD: "I have updated the authentication handler. The code looks correct and is ready to merge."
```

### Best practice: ContextOS Standard (Verified with Automated Gates)

```bash
# GOOD: Run test suite, staged scanner, and consistency checks
npm test
contextos scan --staged --enforce
node .agents/ctx.js validate
```

<!-- Source: TROUBLESHOOTING.md -->

# gemini-precision Troubleshooting & Common Failure Modes

## 1. Test Failure Investigation (No Guesswork)

- **Symptom**: Test fails during `npm test` after code modifications.
- **Root Cause**: Trying to patch the code without reading the exact assertion diff.
- **Fix**: Never guess the fix. View the test file line where assertion failed, inspect expected vs actual output, and resolve the root discrepancy.

## 2. Accidental Staged Secrets or Placeholders

- **Symptom**: `contextos scan --staged --enforce` fails with exit code 1.
- **Root Cause**: Committed temporary `.env` file or left an unfinished `// TODO: implement later` stub in added lines.
- **Fix**: Remove or redact the secret before committing. Fully implement the logic or replace the placeholder with an explicit tracked issue rather than committed code stubs.

## 3. Scope Creep and Excessive Blast Radius

- **Symptom**: Unrelated files reformatted or imports reordered across the repository.
- **Root Cause**: Full-file rewrite instead of targeted surgical replacement.
- **Fix**: Use targeted chunks that touch only the lines specified in the task plan. Avoid modifying unrelated styling or formatting.

## 4. Forbidden Long Dashes

- **Symptom**: Linter or compliance check flags unicode dashes in text.
- **Root Cause**: Using typography dashes (`\u2014` or `\u2013`) instead of standard ASCII hyphens.
- **Fix**: Replace all em-dashes and en-dashes with standard ASCII hyphens (` - `) or appropriate punctuation (parentheses, commas, colons).
