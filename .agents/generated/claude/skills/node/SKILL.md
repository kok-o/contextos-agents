# Node.js

## Overview

Production-grade Node.js runtime and server standard. Enforces async event loop non-blocking hygiene, graceful shutdown, structured JSON logging with correlation IDs, and unhandled rejection guards.

## When to Use

Activate when developing Node.js HTTP servers, Express/Fastify APIs, background workers, CLI tools, or stream-based data pipelines.

## Negative Constraints (What NOT to Do)

1. **NEVER execute synchronous filesystem/crypto calls in request handlers (`fs.readFileSync`)**: Always use async promises (`fs.promises.*`) to avoid blocking the event loop.
2. **NEVER leave uncaught promise rejections**: Every async route must use `express-async-errors` or wrap operations in try/catch calling `next(err)`.
3. **NEVER buffer large files/payloads entirely in memory (`fs.readFile`)**: Always use Streams or Pipelines (`stream.pipeline`) for processing large files.
4. **NEVER store in-memory session or user state on a single process instance**: Use Redis or an external state store to allow multi-instance scaling.
5. **NEVER ignore `SIGTERM` / `SIGINT` shutdown signals**: Always implement graceful shutdown to close open DB pools and drain active HTTP connections.

## Rules & Patterns

## Architecture

- **Layered architecture**: Routes → Controllers → Services → Repositories
- **Dependency injection** — don't import dependencies directly in services
- **Config from environment** — never hardcode secrets, use env variables
- **Graceful shutdown** — handle SIGTERM, close connections, drain requests

## Error Handling

- **Never swallow errors** — always handle or re-throw
- **Custom error classes** — extend Error with HTTP status codes
- **Global error handler** — catch unhandled rejections and uncaught exceptions
- **Structured logging** — JSON logs with request ID, timestamp, level

```typescript
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

## API Design

- **RESTful conventions** — GET (read), POST (create), PUT (full update), PATCH (partial), DELETE
- **Consistent response format** — `{ data, error, pagination }`
- **Validation at the edge** — validate request body/params with Zod or Joi
- **Rate limiting** — protect against abuse
- **CORS** — configure explicitly, never use `*` in production

## Security

- **Helmet.js** — security headers
- **Input validation** — never trust client input
- **SQL injection** — always use parameterized queries
- **XSS** — sanitize output, use Content-Security-Policy
- **Authentication** — JWT with short expiry + refresh tokens
- **Secrets** — environment variables, never in code

## Database

- **Connection pooling** — don't create connections per request
- **Migrations** — version-controlled schema changes
- **Transactions** — for multi-step operations
- **Indexes** — add indexes for frequently queried columns

## Performance

- **Async/await** — never block the event loop
- **Streaming** — for large files and data sets
- **Caching** — Redis for frequently accessed data
- **Clustering** — use PM2 or cluster module for multi-core

## Testing

- **Unit tests** — services and utilities
- **Integration tests** — API endpoints with test database
- **Test isolation** — each test should be independent
- **Fixtures** — use factories, not shared state

## File Structure

```
src/
├── config/          # Configuration
├── modules/         # Feature modules
│   └── users/
│       ├── users.controller.ts
│       ├── users.service.ts
│       ├── users.repository.ts
│       ├── users.routes.ts
│       ├── users.types.ts
│       └── users.test.ts
├── shared/          # Shared utilities
│   ├── middleware/
│   ├── errors/
│   └── utils/
├── types/           # Global types
└── app.ts           # App entry point
```


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


# Node.js Examples — Anti-patterns vs ContextOS Standard

## Example 1: Graceful Process Shutdown

### Anti-pattern: Anti-pattern (Abruptly killing process and dropping in-flight requests)

```javascript
// BAD: drops active database transactions and in-flight HTTP connections
process.on('SIGTERM', () => {
  process.exit(0);
});
```

### Best practice: ContextOS Standard (Graceful connection draining)

```typescript
// GOOD: drains active requests, closes database connections, and exits safely
import http from 'http';
import { prisma } from './db';
import { logger } from './logger';

export function setupGracefulShutdown(server: http.Server) {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await prisma.$disconnect();
        logger.info('Database pool closed.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during database disconnect:', err);
        process.exit(1);
      }
    });

    // Force shutdown after timeout if connections hang
    setTimeout(() => {
      logger.error('Forceful shutdown timeout reached.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

---

## Example 2: Stream-based File Processing

### Anti-pattern: Anti-pattern (Loading entire 500MB file into buffer)

```typescript
// BAD: easily causes Out Of Memory (OOM) crashes under concurrency
app.get('/download/:file', async (req, res) => {
  const data = await fs.promises.readFile(`/uploads/${req.params.file}`);
  res.send(data);
});
```

### Best practice: ContextOS Standard (Piping read stream with pipeline)

```typescript
// GOOD: constant memory usage (O(1) RAM) regardless of file size
import fs from 'fs';
import { pipeline } from 'stream/promises';

app.get('/download/:file', async (req, res, next) => {
  try {
    const filePath = `/uploads/${req.params.file}`;
    const readStream = fs.createReadStream(filePath);
    await pipeline(readStream, res);
  } catch (err) {
    next(err);
  }
});
```

# node Troubleshooting & Common Mistakes

## 1. Unhandled Promise Rejections Crashing the Process

- **Symptom**: Node process crashes abruptly without clear stack trace in production.
- **Root Cause**: Missing `process.on('unhandledRejection')` handler in Node.js >= 15.
- **Fix**: Always register top-level unhandledRejection and uncaughtException logging before exiting cleanly.

## 2. Event Loop Starvation

- **Symptom**: API endpoints stop responding or latency spikes to 10+ seconds.
- **Root Cause**: Heavy synchronous operations (`JSON.parse` on a 50MB file, sync bcrypt hashing, or regex catastrophic backtracking).
- **Fix**: Offload CPU-heavy tasks to Worker Threads or use async worker queues.

## 3. Memory Leaks in Event Emitters

- **Symptom**: "MaxListenersExceededWarning: Possible EventEmitter memory leak detected".
- **Root Cause**: Adding listeners inside request handlers without removing them on close.
- **Fix**: Remove listeners in cleanup callbacks or use `AbortController` signals.