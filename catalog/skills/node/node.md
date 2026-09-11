# Node.js — Best Practices

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
