# fastapi Examples — Anti-patterns vs ContextOS Standard

## Example 1: Asynchronous Route Handlers

### Anti-pattern: Blocking I/O inside `async def`

```python
# BAD: time.sleep or synchronous requests blocks the entire asyncio event loop!
import time
import requests

@app.get("/slow")
async def slow_route():
    time.sleep(5)  # BLOCKS ALL CONCURRENT USERS!
    return {"status": "done"}
```

### Best practice: ContextOS Standard (Non-blocking Async or Def Offload)

```python
# GOOD: Use async non-blocking client (httpx) or standard def for sync CPU work
import asyncio
import httpx

@app.get("/fast")
async def fast_route():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/data")
    return response.json()

# Or standard def (FastAPI automatically runs it in a background threadpool):
@app.get("/sync-worker")
def sync_worker():
    time.sleep(5)  # Runs in worker thread without blocking event loop
    return {"status": "done"}
```
