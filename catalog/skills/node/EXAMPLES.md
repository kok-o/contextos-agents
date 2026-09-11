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
