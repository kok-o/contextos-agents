---
name: Domain-Driven Design
description: >
  ContextOS skill for Domain-Driven Design
---

# Domain-Driven Design

## Overview

Domain-Driven Design standard for robust business software. Enforces separation between domain logic (Entities, Value Objects, Aggregates, Domain Events) and infrastructure frameworks, preventing leaky abstractions.

## When to Use

Activate when designing core business domain models, transactional consistency boundaries, enterprise APIs, or complex aggregate hierarchies.

## Rules & Patterns
<!-- Source: ddd.md -->

## Domain-Driven Design — Patterns & Practices

## When to Use DDD

**Use when:**

- Complex business logic that goes beyond CRUD
- Multiple domain experts with different vocabularies
- The domain model is the competitive advantage
- Enterprise-grade applications

**Don't use when:**

- Simple CRUD applications
- Hackathon/MVP (overkill)
- No domain expert available

## Strategic Design

### Bounded Contexts

The single most important DDD concept. A Bounded Context is a boundary within which a particular model is defined and applicable.

**Example — E-Commerce:**

```
[Order Context]          [Payment Context]       [Shipping Context]
  - Order                  - Payment               - Shipment
  - OrderItem              - Transaction            - TrackingNumber
  - Customer (ref)         - Refund                 - Address
  - Address (value)        - Invoice                - Carrier
```

`Customer` means different things in each context:

- Order Context: name, email, shipping preference
- Payment Context: billing info, payment methods
- Support Context: ticket history, satisfaction score

### Context Map

```
[Order] ←→ [Payment]     # Partnership
[Order] → [Shipping]     # Customer-Supplier
[Order] → [Legacy CRM]   # Anti-Corruption Layer
```

## Tactical Design

### Entities

Objects with identity. Two entities with the same attributes but different IDs are different.

```typescript
class User {
  readonly id: UserId;
  name: string;
  email: Email;  // Value Object
}
```

### Value Objects

Objects defined by their attributes, not identity. Immutable.

```typescript
class Email {
  constructor(readonly value: string) {
    if (!isValidEmail(value)) throw new InvalidEmailError(value);
  }
  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
```

### Aggregates

A cluster of entities and value objects with a single root entity (Aggregate Root). All access goes through the root.

```typescript
class Order {  // Aggregate Root
  private items: OrderItem[] = [];
  
  addItem(product: ProductRef, quantity: number): void {
    // Business logic HERE, not in a service
    if (quantity <= 0) throw new InvalidQuantityError();
    this.items.push(new OrderItem(product, quantity));
  }
  
  get total(): Money {
    return this.items.reduce((sum, item) => sum.add(item.subtotal), Money.zero());
  }
}
```

**Aggregate Rules:**

1. Reference other aggregates by ID only
2. One aggregate per transaction
3. Eventual consistency between aggregates

### Domain Events

Something that happened in the domain that domain experts care about.

```typescript
class OrderPlaced implements DomainEvent {
  constructor(
    readonly orderId: OrderId,
    readonly customerId: CustomerId,
    readonly total: Money,
    readonly occurredAt: Date
  ) {}
}
```

### Domain Services

Business logic that doesn't naturally belong to an entity or value object.

```typescript
class PricingService {
  calculatePrice(order: Order, customer: Customer, promotions: Promotion[]): Money {
    // Complex pricing logic involving multiple aggregates
  }
}
```

### Repositories

Abstraction over data access. One repository per aggregate root.

```typescript
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
  delete(id: OrderId): Promise<void>;
}
```

## Directory Structure (DDD)

```
src/
├── modules/
│   └── orders/                    # Bounded Context
│       ├── domain/
│       │   ├── entities/
│       │   │   └── order.ts       # Aggregate Root
│       │   ├── value-objects/
│       │   │   └── money.ts
│       │   ├── events/
│       │   │   └── order-placed.ts
│       │   ├── services/
│       │   │   └── pricing.ts
│       │   └── repositories/
│       │       └── order.repository.ts  # Interface
│       ├── application/
│       │   ├── commands/
│       │   │   └── place-order.ts
│       │   ├── queries/
│       │   │   └── get-order.ts
│       │   └── handlers/
│       │       └── place-order.handler.ts
│       └── infrastructure/
│           ├── persistence/
│           │   └── order.repository.impl.ts  # Implementation
│           └── api/
│               └── orders.controller.ts
```

### The Clean Architecture Dependency Rule

In DDD, dependencies **MUST strictly point inward**:

```
[ Frameworks & Drivers (Web, DB, UI) ]
      └──▶ [ Interface Adapters (Controllers, Gateways) ]
            └──▶ [ Application (Use Cases, CQRS Handlers) ]
                  └──▶ [ Domain (Entities, Value Objects) ]
```

- The **Domain layer** has ZERO dependencies on ORMs (Prisma, TypeORM), HTTP frameworks (Express, NestJS), or external SDKs.
- Repositories are defined as interfaces in the domain/application layer and implemented in the infrastructure layer.

### Domain Events vs Integration Events

1. **Domain Events**: Represent state changes inside a single Bounded Context.
   - Raised directly inside the Aggregate Root (`order.addItem(...)` raises `OrderItemAdded`).
   - Dispatched in-process before transaction commit.
2. **Integration Events**: Published across Bounded Context boundaries to communicate with other services.
   - Dispatched via Transactional Outbox pattern to message brokers.
   - Must use backward-compatible schemas with versioning.

### Anti-Corruption Layer (ACL)

When consuming data from an external bounded context or 3rd-party vendor API (e.g. Stripe, Salesforce):

- NEVER import external domain models directly into your domain.
- Create an **ACL Translator / Adapter** in the infrastructure layer to convert external DTOs into your own Value Objects and Entities.

---

## Anti-Patterns

- [FAIL] Anemic domain model — entities with only getters/setters, all logic in services
- [FAIL] Big aggregate — aggregates should be small, focused on invariants
- [FAIL] Cross-aggregate transactions — use eventual consistency
- [FAIL] DDD everywhere — use DDD only where complexity justifies it
- [FAIL] ORM entities leaking into Domain — domain entities must not depend on `@Entity()` or ORM decorators


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.
