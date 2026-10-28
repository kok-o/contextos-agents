---
name: fastapi
description: Implement and review FastAPI endpoints, validation, dependencies,
  lifecycle and Python I/O behavior.
---

# fastapi

## Overview

Implement and review FastAPI endpoints, validation, dependencies, lifecycle and Python I/O behavior. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The project actually uses FastAPI or the task asks for it. A Python script or ML experiment alone is not a reason to add a web framework.

## Rules & Patterns

Inspect Python, FastAPI, Pydantic and database/HTTP library versions. Follow existing settings, dependencies and application layout; avoid prescribing a full repository/service architecture for a small endpoint.

Use request and response models for their intended boundary. Validate allowed fields and authorize protected objects independently of Pydantic validation. Keep secrets and internal errors out of responses.

Choose async def with genuinely awaitable libraries; synchronous path operations and dependencies are supported by FastAPI's execution model. Do not run blocking I/O directly on the event loop or assume adding async makes a synchronous library nonblocking.

Own database sessions and clients at a deliberate lifecycle boundary with cleanup on failure. Lightweight in-process background tasks are not durable job delivery; use the existing durable mechanism when work must survive process loss.

Use the project's maintained authentication and password libraries after checking their actual APIs. JWT is not required for every API; token validation and object-level authorization are separate.

## Code Examples

For a create-user endpoint, test invalid fields, a denied caller, the persisted response and failure cleanup. The examples below are partial patterns with stated fixtures/configuration, not an assembled production authentication service.

```
app/
├── main.py              # App entry, CORS, middleware
├── config.py            # App settings (version-specific library)
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

```python
from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

# SQLAlchemy 2.x pattern: configure the factory at app setup, then supply
# the returned dependency through the application's actual Depends wiring.
def make_db_dependency(session_factory: async_sessionmaker[AsyncSession]):
    async def get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session
    return get_db
```

```python
from fastapi import HTTPException

class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})
```

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

## Validation Checklist

- [ ] Run the app's actual endpoint tests when available; distinguish AST parsing from HTTP execution.
- [ ] Check validation, authorization, dependency cleanup and error behavior.

## Common Mistakes

Forcing an async ORM or JWT stack on every project; claiming model validation proves authorization; presenting copied parser fixtures as live API tests.

## Integration Notes

Optional companion guidance: api-design, security, testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
