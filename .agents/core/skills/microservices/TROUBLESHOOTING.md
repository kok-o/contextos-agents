# microservices Troubleshooting & Common Mistakes

## 1. Missing Consumer Idempotency

- **Symptom**: Users charged twice or duplicate records created when events are re-delivered.
- **Root Cause**: Message brokers guarantee at-least-once delivery; network retries re-send events.
- **Fix**: Store processed message/event IDs in a deduplication table with unique constraint.

## 2. Circular Service Dependencies

- **Symptom**: Service A cannot boot or operate without Service B, and Service B depends on Service A.
- **Root Cause**: Improper domain boundaries and coupled synchronous dependencies.
- **Fix**: Invert dependency using domain events or introduce a composite BFF/Orchestrator.

## 3. Distributed Tracing Blindness

- **Symptom**: Impossible to diagnose which downstream microservice caused a 500 error or latency spike.
- **Root Cause**: HTTP headers and event messages do not propagate correlation IDs.
- **Fix**: Propagate X-Correlation-ID / traceparent across all HTTP requests and event headers.
