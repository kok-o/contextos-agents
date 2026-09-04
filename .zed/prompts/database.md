# ContextOS — database

> Database architecture, schema design, Prisma, Drizzle ORM, indexing strategies, migrations, and N+1 query resolution.

# database

## Overview

Relational database design, query optimization, migration safety, connection pooling in serverless environments, and ORM usage across PostgreSQL, Prisma, and Drizzle.

## When to Use

Activate for tasks involving database schema design, migrations, indexing, relational models, ORM queries, transactions, or query performance tuning.

## Rules & Patterns

### Negative Constraints (What NOT to Do)

1. **NEVER do `SELECT *` in production**: Always select explicit columns required by the caller to minimize memory bandwidth and lock footprint.
2. **NEVER run destructive migrations without backward compatibility**: Always follow expand-and-contract (Phase 1: add new column as nullable; Phase 2: backfill; Phase 3: make non-nullable & remove old column).
3. **NEVER execute queries in loops (The N+1 Anti-Pattern)**: Always use batch loading (`inArray`, `DataLoader`, or relational `include` / `JOIN`).
4. **NEVER leave foreign keys without indexes**: In PostgreSQL/MySQL, child foreign key columns must always have an index to prevent table-level locking on cascade deletes.
5. **NEVER perform multi-entity writes without a database transaction**: Any operation touching multiple records must use `prisma.$transaction` or `db.transaction`.
6. **NEVER open unpooled database connections in Serverless / Edge functions**: Serverless scale-outs will instantly exhaust PostgreSQL's `max_connections`.

---

### Zero-Downtime Migrations (Expand-and-Contract)

When modifying schemas with zero downtime:

1. **Phase 1 (Expand)**: Add the new column as `NULLABLE` (or with a default value). Deploy the application code that reads from old column and writes to both old and new.
2. **Phase 2 (Backfill)**: Run an asynchronous batch migration job in chunks (e.g. 1000 rows at a time) to populate data from old column to new column.
3. **Phase 3 (Contract)**: Update application code to read and write exclusively from the new column.
4. **Phase 4 (Cleanup)**: Once traffic is fully shifted, remove the old column and mark the new column as `NOT NULL` in a separate migration.

---

### Serverless & Edge Connection Pooling

In serverless environments (AWS Lambda, Vercel Functions):

- Always connect via a connection pooler:
  - **Prisma**: Use Prisma Accelerate or configure transaction mode connection URLs.
  - **Drizzle / Node-Postgres**: Use `@neondatabase/serverless` or connect to PgBouncer pooler port (`6543`) with `max: 1` per serverless container.
- Set strict statement timeouts (e.g. `statement_timeout = '5000'`) to prevent hanging queries from exhausting pool capacity.

---

### Indexing & Performance Rules

- **B-Tree Indexes**: For high-cardinality filters (`status`, `user_id`, `created_at`).
- **Composite Indexes**: When querying multiple columns together (`WHERE organization_id = ? AND status = ?`), order columns in index by equality first, range second.
- **Partial Indexes**: For sparse boolean flags (`WHERE is_processed = false`).
- **Covering Indexes**: Include frequently selected columns (`INCLUDE (title, created_at)`) to enable index-only scans without table heap access.

---

## Code Examples

### Zero-Downtime Column Rename (Drizzle ORM)

```typescript
// Step 1 (Expand): Keep old column, add new column
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 255 }), // new column
  name: varchar('name', { length: 255 }),           // old column kept during transition
});

// App write logic during transition:
await db.insert(users).values({
  name: input.name,
  fullName: input.name
});
```

---

## Validation Checklist

- [ ] All database queries select explicit required columns (no `SELECT *`).
- [ ] Foreign keys have matching indexes on child tables.
- [ ] Multi-table writes wrapped in ACID transactions.
- [ ] No N+1 queries in loops.
- [ ] Schema migrations tested against expand-and-contract pattern.
- [ ] Serverless database connection string uses pooling proxy.

---

## Common Mistakes

- **Missing pagination limits**: Unbounded `findMany()` calls leading to Out-Of-Memory crashes under production volume.
- **Locking entire tables**: Adding `NOT NULL` columns with heavy compute defaults in PostgreSQL without concurrent index creation.

---

## Integration Notes

- Interacts with `system-design`, `ddd`, and `security` (multi-tenant tenantId scoping).


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

# Database Troubleshooting Guide

## Common Issues & Fixes

### 1. Connection Pool Exhaustion in Serverless / Edge

- **Cause**: Creating a new PrismaClient / DB connection instance on every serverless function invocation.
- **Fix**: Declare PrismaClient as a global singleton across warm lambdas, and enable PgBouncer or Prisma Accelerate.

### 2. Slow Queries on Large Tables

- **Cause**: Missing composite index on filtered and ordered columns.
- **Fix**: Run `EXPLAIN ANALYZE <query>` and add targeted indexes matching the WHERE and ORDER BY columns.

### 3. Database Deadlocks during Concurrent Transactions

- **Cause**: Different transactions updating resources in different orders.
- **Fix**: Always acquire locks and update entities in a deterministic alphabetical or ID-ordered sequence.
