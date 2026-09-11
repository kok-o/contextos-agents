# ddd Troubleshooting & Common Mistakes

## 1. God Aggregates

- **Symptom**: Aggregate Root contains 20 child entities and loading it requires joining dozens of tables.
- **Root Cause**: Treating ERD tables as aggregate boundaries rather than transactional consistency units.
- **Fix**: Design small aggregates. Reference other aggregates by ID only, not by object reference.

## 2. Leaking Infrastructure into Domain Layer

- **Symptom**: Domain entities import Prisma, TypeORM decorators, or Express Request objects.
- **Root Cause**: Inverting Clean Architecture boundaries.
- **Fix**: The Domain layer must be pure TypeScript with zero external framework dependencies.

## 3. Transaction Spanning Multiple Aggregates

- **Symptom**: High database lock contention and deadlocks under concurrent transactions.
- **Root Cause**: Modifying multiple aggregate roots within the same database transaction.
- **Fix**: Rule of thumb: Exactly one Aggregate Root modified per transaction. Use Domain Events for eventual consistency across other aggregates.
