# decisions Examples — Anti-patterns vs ContextOS Standard

## Example 1: Documenting Tech Choices

### Anti-pattern: Tribal Knowledge & Undocumented Decisions

```text
"We switched to Redis for session storage last month because Dan said so on Slack."
Three months later, Dan leaves and nobody knows why the config is set up this way.
```

### Best practice: ContextOS Standard (MADR Architecture Decision Record)

```markdown
# ADR 0003: Use Redis for Distributed Session Storage

## Context and Problem Statement
Our application is transitioning from a single server to horizontally auto-scaled instances.
Sticky sessions on load balancer cause uneven distribution and drop sessions on node recycling.

## Considered Options
1. PostgreSQL session table
2. Redis cluster
3. JWT stateless tokens in cookies

## Decision Outcome
Chosen option: "Redis cluster", because:
- Sub-millisecond read/write latency compared to relational DB queries.
- Built-in TTL automatically handles session expiration without cron cleanup.
- Avoids security risks of client-stored JWT revocation.

## Consequences
- Positive: Stateless web tier, zero session drops on deployment.
- Negative: Adds operational dependency on Redis cluster infrastructure.
```
