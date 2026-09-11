# System Design — Patterns & Principles

## Architecture Patterns

### Monolith (Start Here)

- **When**: MVP, small team, < 100K users
- **Structure**: Modular monolith with clear boundaries
- **Rule**: You can always extract microservices later. You can't easily merge them back.

### Microservices

- **When**: Team > 10 engineers, independent deployment needed
- **Communication**: REST (sync), Message Queue (async)
- **Data**: Each service owns its database
- **Pitfalls**: Network complexity, distributed transactions, debugging difficulty

### Event-Driven

- **When**: Loose coupling between services, async processing
- **Patterns**: Event Sourcing, CQRS, Pub/Sub
- **Tools**: Kafka, RabbitMQ, AWS SQS, Redis Streams

## Scalability

### Horizontal vs Vertical

- **Vertical first** — upgrade your server before distributing
- **Horizontal when** — you hit single-machine limits or need redundancy

### Database Scaling

1. **Indexes** — most common fix for slow queries
2. **Read replicas** — for read-heavy workloads
3. **Connection pooling** — PgBouncer, connection limits
4. **Caching** — Redis for hot data
5. **Sharding** — last resort, adds massive complexity

### Caching Layers

```
Client Cache (browser) → CDN → API Cache (Redis) → Database
```

| Strategy | Description |
| --- | --- |
| Cache-Aside | App checks cache first, fetches from DB on miss |
| Write-Through | App writes to cache AND DB simultaneously |
| Write-Behind | App writes to cache, async write to DB |
| TTL-based | Set expiry, accept stale data |

## Load Balancing

- **Round Robin** — simple, default
- **Least Connections** — for varying request duration
- **IP Hash** — for sticky sessions (avoid if possible)
- **Health checks** — remove unhealthy instances

## API Design

### REST Conventions

```
GET    /users          → List users
GET    /users/:id      → Get user
POST   /users          → Create user
PUT    /users/:id      → Full update
PATCH  /users/:id      → Partial update
DELETE /users/:id      → Delete user
```

### Pagination

- Cursor-based for real-time data (recommended)
- Offset-based for static data

### Versioning

- URL-based (`/v1/`, `/v2/`) — simplest
- Header-based — more flexible

## Reliability

- **Circuit breaker** — stop calling failing services
- **Retry with exponential backoff** — for transient failures
- **Timeout** — every external call needs a timeout
- **Health checks** — `/health` endpoint for load balancers
- **Graceful degradation** — work with reduced functionality

## Data Storage

| Use Case | Technology |
| --- | --- |
| Relational data, ACID | PostgreSQL |
| Key-value, caching | Redis |
| Full-text search | Elasticsearch, Meilisearch |
| Document store | MongoDB (if truly schemaless) |
| Time series | TimescaleDB, InfluxDB |
| Blob storage | S3, R2 |
| Queue | Redis Streams, RabbitMQ, SQS |

## Decision Framework

Before choosing an architecture:

1. What's the expected load? (users, requests/sec)
2. What's the team size?
3. What's the timeline?
4. What are the consistency requirements?
5. What's the budget?

**Default answer**: Start with a monolith, PostgreSQL, Redis cache. Extract services only when you have data showing you need to.
