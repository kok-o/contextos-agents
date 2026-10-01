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
