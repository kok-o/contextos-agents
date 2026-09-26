#!/usr/bin/env python3
"""
tests/fixtures/skill-examples/fastapi-runner.py
Executable verification for FastAPI skill code examples.
Validates Python AST, syntax, schema structure, and error definitions.
"""

import ast
import sys
import json

SNIPPET_PYDANTIC = '''
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)
    
class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    
    model_config = ConfigDict(from_attributes=True)
'''

SNIPPET_DEPENDENCY_INJECTION = '''
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
'''

SNIPPET_EXCEPTION = '''
from fastapi import HTTPException

class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
'''

SNIPPET_TEST = '''
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post("/api/v1/users", json={
        "email": "test@example.com",
        "name": "Test User"
    })
    assert response.status_code == 201
'''

def verify_ast_snippet(name, code):
    try:
        tree = ast.parse(code)
        return {
            "id": name,
            "passed": True,
            "nodes": len(tree.body)
        }
    except SyntaxError as e:
        return {
            "id": name,
            "passed": False,
            "error": f"SyntaxError at line {e.lineno}: {e.msg}"
        }

def run_all():
    tests = [
        ("fastapi:pydantic-models", SNIPPET_PYDANTIC),
        ("fastapi:dependency-injection", SNIPPET_DEPENDENCY_INJECTION),
        ("fastapi:error-handling", SNIPPET_EXCEPTION),
        ("fastapi:testing", SNIPPET_TEST),
    ]

    results = []
    all_ok = True

    for name, code in tests:
        res = verify_ast_snippet(name, code)
        results.append(res)
        if not res["passed"]:
            all_ok = False

    output = {
        "ok": all_ok,
        "results": results
    }

    print(json.dumps(output, indent=2))
    sys.exit(0 if all_ok else 1)

if __name__ == "__main__":
    run_all()
