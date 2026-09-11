# ddd Examples — Anti-patterns vs ContextOS Standard

## Example 1: Domain Entities vs Anemic Models

### Anti-pattern: Anemic Domain Model with Leaky Setters

```typescript
// BAD: Zero business invariants; any caller can corrupt state
class BankAccount {
  public balance: number = 0;
  public isFrozen: boolean = false;
}

// Logic leaked into controller or service
account.balance -= 500; // Overdraft not checked!
```

### Best practice: ContextOS Standard (Rich Domain Model with Guarded Invariants)

```typescript
// GOOD: Invariants strictly enforced inside Aggregate Root
class BankAccount {
  private _balance: number;
  private _isFrozen: boolean;

  constructor(id: string, initialDeposit: Money) {
    this._balance = initialDeposit.amount;
    this._isFrozen = false;
  }

  public withdraw(amount: Money): void {
    if (this._isFrozen) {
      throw new AccountFrozenException('Cannot withdraw from a frozen account');
    }
    if (this._balance < amount.amount) {
      throw new InsufficientFundsException('Insufficient funds for withdrawal');
    }
    this._balance -= amount.amount;
    this.addDomainEvent(new MoneyWithdrawnEvent(this.id, amount));
  }
}
```
