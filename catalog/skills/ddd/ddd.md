# Domain-Driven Design — Patterns & Practices

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

## Anti-Patterns

- [FAIL] Anemic domain model — entities with only getters/setters, all logic in services
- [FAIL] Big aggregate — aggregates should be small, focused on invariants
- [FAIL] Cross-aggregate transactions — use eventual consistency
- [FAIL] DDD everywhere — use DDD only where complexity justifies it
