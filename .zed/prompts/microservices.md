# ContextOS — Microservices

> Distributed systems architecture standard. Enforces bounded context isolation, asynchronous event-driven messaging (Kafka, RabbitMQ), Saga distributed transactions, API gateways, and outbox patterns.

# Microservices

## Overview

Distributed systems architecture standard. Enforces bounded context isolation, asynchronous event-driven messaging (Kafka, RabbitMQ), Saga distributed transactions, API gateways, and outbox patterns.

## When to Use

Activate when decomposing monoliths into independent services, designing inter-service communications, or building scalable distributed systems.

## Rules & Patterns
<!-- Source: microservices.md -->

## Microservices — Architecture Guide

## When to Use Microservices

**Use when:**

- Team > 10 engineers working on the same product
- Independent deployment of components is critical
- Different components have different scaling needs
- Different components need different tech stacks

**Don't use when:**

- Small team (< 5 engineers)
- MVP or prototype
- No operational expertise (monitoring, tracing, deployment)
- Tight coupling between components

## Core Principles

### 1. Single Responsibility

Each service does ONE thing well.

### 2. Own Your Data

Each service has its own database. No shared databases.

### 3. API Contracts

Services communicate through well-defined APIs. Internal implementation is hidden.

### 4. Autonomous Deployment

Each service can be deployed independently.

## Communication Patterns

### Synchronous (REST/gRPC)

- **When**: Request needs immediate response
- **Tools**: REST (HTTP), gRPC (high-performance)
- **Risk**: Cascading failures, latency accumulation

### Asynchronous (Events/Messages)

- **When**: Eventual consistency is acceptable
- **Tools**: Kafka, RabbitMQ, Redis Streams, AWS SQS
- **Benefit**: Loose coupling, resilience

### Saga Pattern (Distributed Transactions)

```
Order Service → Payment Service → Inventory Service → Shipping Service
      ↓ (failure)
Compensating transactions reverse each step
```

1. **Choreography (Event-Driven)**: Each service emits events, downstream services listen and react. Best for simple flows (≤ 3 steps) where a central coordinator adds unnecessary coupling.
2. **Orchestration (State Machine)**: A dedicated Saga Orchestrator controls the flow and explicitly triggers compensating transactions on failure (e.g., `RefundPayment`, `ReleaseInventoryReservation`). Mandatory for complex multi-step workflows.

### Dead Letter Queues (DLQ) & Poison Pill Handling

- **Never retry infinitely**: Set max retries (e.g. 3) with exponential backoff and jitter.
- After max retries, route failed messages to a **Dead Letter Queue (DLQ)** with error metadata.
- Provide alerting on DLQ depth and an admin CLI/script to replay DLQ messages.

## CQRS (Command Query Responsibility Segregation)

Separate read and write models:

```
Command (Write) → Write Model → Event Store → Projections → Read Model → Query (Read)
```

**When**: Read patterns differ significantly from write patterns.

## Event Sourcing

Store events, not state:

```
UserCreated → EmailUpdated → RoleChanged → PasswordReset
```

Current state = replay all events. Full audit trail.

## Service Boundaries

### Bounded Contexts (from DDD)

- Identify domain boundaries
- Each service maps to a bounded context
- Shared language within the context, translation at boundaries

### Anti-Corruption Layer

When integrating with legacy or external systems, create an adapter that translates between models.

## Operational Concerns

### Observability (The Three Pillars)

1. **Logs** — structured JSON, correlated by request ID
2. **Metrics** — latency, error rate, throughput (RED)
3. **Traces** — distributed tracing across services (Jaeger, Zipkin)

### Resilience

- **Circuit Breaker** — stop calling failing services
- **Retry with Backoff** — exponential backoff + jitter
- **Timeout** — every call has a timeout
- **Bulkhead** — isolate failures

### Deployment

- **Containers** — Docker for consistency
- **Orchestration** — Kubernetes for production
- **CI/CD** — independent pipelines per service
- **Blue-Green / Canary** — safe rollouts

## Anti-Patterns

- [FAIL] Distributed monolith — services that can't deploy independently
- [FAIL] Shared database — defeats the purpose
- [FAIL] Synchronous chains — A calls B calls C calls D
- [FAIL] No versioning — breaking API changes
- [FAIL] Premature microservices — start with a modular monolith


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.

