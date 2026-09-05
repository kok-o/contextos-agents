# system-design Examples — Anti-patterns vs ContextOS Standard

## Example 1: Database Caching Strategy

### Anti-pattern: Cache-Aside with Unbounded Thundering Herd

```typescript
// BAD: When cache expires, 10,000 concurrent requests hit PostgreSQL simultaneously
async function getUserProfile(id: string) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);
  const user = await db.user.findUnique({ where: { id } });
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 300);
  return user;
}
```

### Best practice: ContextOS Standard (Mutex Lock / Single-Flight Pattern)

```typescript
// GOOD: Only one worker fetches from DB on cache miss; others wait
import { singleflight } from './singleflight';

async function getUserProfile(id: string) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  return singleflight.do(`user:${id}`, async () => {
    const fresh = await redis.get(`user:${id}`);
    if (fresh) return JSON.parse(fresh);

    const user = await db.user.findUnique({ where: { id } });
    if (user) {
      await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 300);
    }
    return user;
  });
}
```

---

## Example 2: Outbox Pattern for Distributed Consistency

### Anti-pattern: Dual-Write Anti-pattern (Direct DB write + Kafka publish)

```typescript
// BAD: If Kafka publish fails, DB change is committed but event is lost forever
async function createOrder(data: OrderInput) {
  const order = await db.order.create({ data });
  await kafkaProducer.send({ topic: 'orders', messages: [{ value: JSON.stringify(order) }] });
  return order;
}
```

### Best practice: ContextOS Standard (Transactional Outbox)

```typescript
// GOOD: Order and Outbox record committed in a single atomic DB transaction
async function createOrder(data: OrderInput) {
  return await db.$transaction(async (tx) => {
    const order = await tx.order.create({ data });
    await tx.outbox.create({
      data: {
        aggregateType: 'Order',
        aggregateId: order.id,
        eventType: 'OrderCreated',
        payload: JSON.stringify(order),
        status: 'PENDING',
      },
    });
    return order;
  });
}
```
