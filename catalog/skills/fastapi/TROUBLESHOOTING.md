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
