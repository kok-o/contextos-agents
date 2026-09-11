# system-design Troubleshooting & Common Mistakes

## 1. Serverless Connection Exhaustion

- **Symptom**: "FATAL: remaining connection slots are reserved for non-replication superuser connections" under modest traffic.
- **Root Cause**: Serverless/Edge functions opening new DB connection pools per invoked instance.
- **Fix**: Use a connection pooler like PgBouncer or managed pooling (Supabase connection pool, AWS RDS Proxy, Prisma Accelerate).

## 2. Cache Invalidation Drift

- **Symptom**: Users see stale, outdated data after making updates.
- **Root Cause**: Updates to database do not invalidate related cache keys, or TTLs are set to infinite.
- **Fix**: Invalidate cache keys explicitly on write in the same transactional flow, and always set defensive TTLs.

## 3. Lack of Rate Limiting and Backpressure

- **Symptom**: Backend crashes or slows to a crawl during traffic spikes or bot scraping.
- **Root Cause**: Unthrottled public endpoints without token-bucket or sliding-window rate limiting.
- **Fix**: Add rate-limiting middleware (Redis-backed sliding window) at the API gateway / Edge layer.
