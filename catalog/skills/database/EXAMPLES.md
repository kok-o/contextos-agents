# Database Examples — Anti-patterns vs ContextOS Standard

## Example 1: Solving the N+1 Query Problem

### Anti-pattern: Anti-pattern (N+1 database queries in a loop)

```typescript
// BAD: 1 query for users + N queries for posts!
const users = await prisma.user.findMany();
const usersWithPosts = [];
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { userId: user.id } }); // N queries!
  usersWithPosts.push({ ...user, posts });
}
```

### Best practice: ContextOS Standard (Batch query or relational include)

```typescript
// GOOD: 1 single optimized batch query
const usersWithPosts = await prisma.user.findMany({
  where: { isActive: true },
  select: {
    id: true,
    name: true,
    email: true,
    posts: {
      where: { published: true },
      select: { id: true, title: true, createdAt: true },
      take: 5
    }
  }
});
```

---

## Example 2: Safe Atomic Transactions with Locking

### Anti-pattern: Anti-pattern (Unprotected read-modify-write race condition)

```typescript
// BAD: race condition between reading balance and updating
const account = await prisma.account.findUnique({ where: { id } });
if (account.balance >= amount) {
  await prisma.account.update({
    where: { id },
    data: { balance: account.balance - amount }
  });
}
```

### Best practice: ContextOS Standard (Atomic conditional update in transaction)

```typescript
// GOOD: atomic database transaction with invariant check
export async function deductBalance(accountId: string, amount: number) {
  return await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: {
        id: accountId,
        balance: { gte: amount }
      },
      data: {
        balance: { decrement: amount }
      }
    });

    if (updated.count === 0) {
      throw new InsufficientFundsError(accountId);
    }
  });
}
```
