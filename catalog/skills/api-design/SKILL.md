---
name: api-design
description: Guides stable API and interface design. Enforces Hyrum's Law awareness, contract-first development, uniform error shapes, boundary validation, and idempotency patterns.
---

# API and Interface Design

Design stable, self-documenting, and robust interfaces that are hard to misuse. Good interfaces make the right thing easy and the wrong thing difficult. This applies to REST APIs, GraphQL schemas, RPC services, and internal module contracts.

## Core Principles

### 1. Hyrum's Law Awareness

> With a sufficient number of users of an API, all observable behaviors of your system will be depended on by somebody, regardless of what you promise in the contract.

Design implications:
- **Never leak internal implementation details**: Database column names, raw ORM errors, stack traces, and internal IDs must never escape to clients.
- **Lock down response shapes**: Undocumented extra fields or varying JSON key ordering become accidental dependencies.
- **Design for evolution**: Additive changes are safe; removing, renaming, or changing types of fields requires a deprecation window.

### 2. Contract-First Development

Define the interface and data types before implementing handlers or controllers:
1. Specify TypeScript interfaces, JSON Schemas, or OpenAPI documents.
2. Review the contract independently of database models.
3. Generate server stubs and client SDK types from the unified contract.

### 3. Uniform Error Semantics

All API error responses must adhere to a single predictable schema across the entire application:

```typescript
interface APIErrorResponse {
  error: {
    code: string;        // Machine-readable uppercase token (e.g., "VALIDATION_FAILED")
    message: string;     // Clear, user-safe human-readable description
    details?: unknown;   // Specific field errors or structured context
  };
}
```

Standard HTTP status mappings:
- `400 Bad Request`: Malformed syntax or unparseable request body.
- `401 Unauthorized`: Authentication credentials missing or invalid.
- `403 Forbidden`: Authenticated, but lacks required permissions.
- `404 Not Found`: Target resource does not exist.
- `409 Conflict`: Resource state conflict (e.g., duplicate unique key).
- `422 Unprocessable Entity`: Well-formed request failed semantic validation.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unhandled server condition (never leak stack details).

### 4. Boundary Validation

Trust internal services, but validate strictly at external boundaries:
- Validate every query parameter, path variable, header, and request payload using schemas (e.g. Zod, Pydantic, TypeBox).
- Sanitize inputs against injection attacks before passing them to services.
- Return explicit validation errors pinpointing the exact field and issue.

### 5. Idempotent State Mutations

Any non-safe HTTP mutation (`POST` creating resources, charging payments, or executing transfers) should support an `Idempotency-Key` header:
- Store operation results indexed by `Idempotency-Key` with a TTL (e.g. 24 hours).
- Subsequent requests with the same key immediately return the cached response without re-executing side effects.
