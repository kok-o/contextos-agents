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
