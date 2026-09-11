# microservices Examples — Anti-patterns vs ContextOS Standard

## Example 1: Inter-service Communication

### Anti-pattern: Synchronous HTTP Call Chains (The Distributed Monolith)

```text
User -> OrderService (HTTP) -> InventoryService (HTTP) -> PaymentService (HTTP) -> EmailService (HTTP)
Problem: High latency, 99.9% availability compounding to 96% overall availability, cascading failure.
```

### Best practice: ContextOS Standard (Asynchronous Event Choreography)

```text
User -> OrderService (creates order with status 'PENDING')
OrderService publishes 'OrderPlaced' event to Event Broker (Kafka/RabbitMQ)
  ├── InventoryService consumes 'OrderPlaced' -> Reserves stock
  ├── PaymentService consumes 'OrderPlaced' -> Charges customer
  └── NotificationService consumes 'PaymentProcessed' -> Sends confirmation email
```

---

## Example 2: Database Architecture

### Anti-pattern: Shared Database Across Multiple Microservices

```text
BAD: OrderService and UserService both directly read and write to the same 'users' table.
Schema migrations in UserService immediately break OrderService.
```

### Best practice: ContextOS Standard (Database-per-Service)

```text
GOOD: UserService owns user data. OrderService maintains a local read-model (denormalized user info)
synchronized via 'UserUpdated' events. Each service can migrate and scale independently.
```
