# API Design - Troubleshooting & Common Edge Cases

## Common Diagnostic Scenarios

### 1. Accidental Hyrum's Law Contract Leakage

- **Symptom**: Frontend clients start breaking after an internal database migration or ORM upgrade, even though the documented API schema did not change.
- **Root Cause**: The API endpoint returned raw database entity objects (`res.json(user)`) instead of projecting through an explicit DTO (Data Transfer Object). Undocumented fields, changed nullability, or reordered keys broke client assumptions.
- **Fix Protocol**:
  1. Never pass raw ORM instances directly to response serializers.
  2. Map domain models through strict schema parsers or DTO mappers (`toUserDTO(user)`).
  3. Strip internal metadata columns (`__v`, `password_hash`, internal foreign keys).

---

### 2. High-Concurrency Race Conditions with Idempotency Keys

- **Symptom**: Two duplicate `POST /payments` requests sent concurrently with the exact same `Idempotency-Key` both execute the underlying charge twice.
- **Root Cause**: Check-then-act race condition in the idempotency store. Reading `store.get(key)` and writing `store.set(key)` were not executed atomically.
- **Fix Protocol**:
  1. Use atomic reservations with state transitions: `PENDING` -> `RESOLVED`.
  2. In Redis, execute `SET key "PENDING" NX EX 120`. If the key already exists, return `409 Conflict` or poll until `RESOLVED`.
  3. Once the mutation succeeds, atomically update the key with the serialized response body and final HTTP status code.

---

### 3. Inconsistent Error Response Shapes Across Endpoints

- **Symptom**: Some API routes return `{ message: "Not found" }`, others return `{ error: "Not found" }`, and uncaught server errors return `{ statusCode: 500, error: "Internal Server Error" }`.
- **Root Cause**: Different libraries or individual route handlers constructing ad-hoc error literals without centralized error middleware.
- **Fix Protocol**:
  1. Implement a single global error handler middleware.
  2. Define an `AppError` class with machine-readable error codes.
  3. Ensure all errors format strictly as:
     ```json
     {
       "error": {
         "code": "RESOURCE_NOT_FOUND",
         "message": "User with id 123 does not exist",
         "details": null
       }
     }
     ```

---

### 4. Non-Additive Breaking Changes in Schema Evolution

- **Symptom**: Renaming an optional field `fullName` to `name` breaks mobile clients that have not updated yet.
- **Root Cause**: Violating the additive evolution rule.
- **Fix Protocol**:
  1. Add new fields alongside existing ones: maintain both `name` and `fullName` during the deprecation window.
  2. Mark `fullName` as deprecated in OpenAPI specs.
  3. Monitor usage via analytics; remove the deprecated field only after traffic drops to zero and a major version bump occurs.
