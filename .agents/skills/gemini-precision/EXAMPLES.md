# Gemini execution examples

## Inspect before integration

Before calling a password helper, read its export and signature. Do not infer a
package, import path, or return type from an example. Name the checked files and
run the relevant authentication regression.

## Complete pure calculation with an explicit boundary

This block validates integer minor-unit amounts and computes a proposed balance.
It does not execute or persist a transfer. A real payment operation also needs
trusted authorization, concurrency control, idempotency, and a transactional
persistence boundary. Do not report this function as a completed integration.

<!-- example: gemini-transfer -->
```javascript
export function processTransaction(tx) {
  if (!tx || typeof tx !== 'object' ||
      typeof tx.id !== 'string' || !tx.id ||
      typeof tx.senderId !== 'string' || !tx.senderId) {
    throw new TypeError('Transaction identity required');
  }
  if (!Number.isSafeInteger(tx.amount) || tx.amount <= 0 ||
      !Number.isSafeInteger(tx.senderBalance) || tx.senderBalance < 0) {
    throw new TypeError('Amounts must be safe integer minor units');
  }
  if (tx.senderBalance < tx.amount) throw new RangeError('Insufficient funds');
  return {
    status: 'validated',
    transactionId: tx.id,
    newBalance: tx.senderBalance - tx.amount,
  };
}
```

The example verifier rejects NaN, Infinity, fractional/unsafe amounts, and
insufficient balances. These cases establish the calculation's stated contract.

## Relevant proof of work

For an authorization fix, run an allowed-user case, a denied-user case, and the
affected integration checks. In this source checkout, skill consistency and
staged placeholder checks are separate commands:

```powershell
node .agents/ctx.js validate
node bin/index.js scan --staged --enforce --placeholders
```

An empty staged index says nothing about unstaged changes. Supply --scope <file>
when an actual scope JSON file is part of the task.
