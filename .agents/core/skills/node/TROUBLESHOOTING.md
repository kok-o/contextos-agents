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
