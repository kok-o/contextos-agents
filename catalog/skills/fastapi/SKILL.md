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

## FastAPI - Best Practices

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
from pydantic import BaseModel, EmailStr, Field, ConfigDict

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
from typing import AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/token")

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await user_repo.get_by_id(db, user_id=user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
```

## Async

- **Use async** for all I/O operations (database, HTTP calls, file I/O)
- **Never block the event loop** - no sync I/O in async endpoints
- **Use `asyncio.gather`** for parallel async operations
- **Background tasks** - use `BackgroundTasks` for non-critical work

## Error Handling

```python
from fastapi import HTTPException

class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
```

## Security

- **OAuth2 with JWT** - use `python-jose`
- **Password hashing** - bcrypt via `passlib`
- **CORS** - configure explicitly
- **Rate limiting** - use `slowapi`
- **Input validation** - Pydantic handles this automatically

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

- [FAIL] Business logic in route handlers - use services
- [FAIL] Raw SQL without ORM - use SQLAlchemy
- [FAIL] Sync database calls - use async drivers
- [FAIL] Hardcoded settings - use Pydantic BaseSettings
- [FAIL] No schema validation - always use Pydantic models


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.
