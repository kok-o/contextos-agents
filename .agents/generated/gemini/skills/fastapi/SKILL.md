---
name: FastAPI
description: >
  ContextOS skill for FastAPI
---
# FastAPI

## Overview

High-performance Python backend engineering using FastAPI, Pydantic v2, and async SQLAlchemy/Tortoise ORM. Enforces type-driven request validation, OpenAPI contracts, and async non-blocking endpoints.

## When to Use

Activate when building Python REST APIs, microservices, asynchronous background jobs, or integrating Python ML services into web backends.

## Rules & Patterns
<!-- Source: fastapi.md -->

## FastAPI — Best Practices

## Project Structure

```
app/
├── main.py              # App entry, CORS, middleware
├── config.py            # Settings with Pydantic BaseSettings
├── database.py          # Database session, engine
├── models/              # SQLAlchemy models
│   ├── __init__.py
│   └── user.py
├── schemas/             # Pydantic schemas (request/response)
│   ├── __init__.py
│   └── user.py
├── api/                 # Route handlers
│   ├── __init__.py
│   ├── deps.py          # Dependency injection
│   └── v1/
│       ├── __init__.py
│       └── users.py
├── services/            # Business logic
│   └── user_service.py
├── repositories/        # Database access
│   └── user_repo.py
└── tests/
    └── test_users.py
```

## Pydantic Models

```python
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)
    
class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    
    model_config = ConfigDict(from_attributes=True)
```

## Dependency Injection

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    # Verify token, return user
    ...
```

## Async

- **Use async** for all I/O operations (database, HTTP calls, file I/O)
- **Never block the event loop** — no sync I/O in async endpoints
- **Use `asyncio.gather`** for parallel async operations
- **Background tasks** — `BackgroundTasks` for non-critical work

## Error Handling

```python
from fastapi import HTTPException

class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
```

## Security

- **OAuth2 with JWT** — use `python-jose`
- **Password hashing** — bcrypt via `passlib`
- **CORS** — configure explicitly
- **Rate limiting** — use `slowapi`
- **Input validation** — Pydantic handles this automatically

## Testing

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post("/api/v1/users", json={
        "email": "test@example.com",
        "name": "Test User"
    })
    assert response.status_code == 201
```

## Anti-Patterns

- [FAIL] Business logic in route handlers — use services
- [FAIL] Raw SQL without ORM — use SQLAlchemy
- [FAIL] Sync database calls — use async drivers
- [FAIL] Hardcoded settings — use Pydantic BaseSettings
- [FAIL] No schema validation — always use Pydantic models


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


<!-- Source: EXAMPLES.md -->

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

<!-- Source: TROUBLESHOOTING.md -->

# fastapi Troubleshooting & Common Mistakes

## 1. Pydantic v1 vs v2 Deprecations

- **Symptom**: Warnings or crashes regarding @validator or .dict() methods.
- **Root Cause**: FastAPI projects upgrading to Pydantic v2.
- **Fix**: Use @field_validator instead of @validator, and .model_dump() instead of .dict().

## 2. Database Session Leaks

- **Symptom**: Database pool runs out of connections after a few requests.
- **Root Cause**: Database sessions opened manually without proper try...finally or dependency injection.
- **Fix**: Always provide database sessions via Depends(get_db) with a yield block.

## 3. Unhandled Validation Errors Returning Inconsistent JSON

- **Symptom**: Frontend receives raw 422 arrays without matching standard API error response envelope.
- **Root Cause**: Missing custom RequestValidationError handler.
- **Fix**: Register an app-level exception handler for RequestValidationError that normalizes error shapes.
