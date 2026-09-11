# generators Examples — Anti-patterns vs ContextOS Standard

## Example 1: Technical Documentation Generation

### Anti-pattern: Scaffolding from Scratch Without Templates

```text
Agent drafts a 2-paragraph "architecture overview" missing databases, security, and hosting models.
```

### Best practice: ContextOS Standard (ctx init Template Generation)

```text
Generates complete engineering suite:
- PRD.md (User personas, in-scope, out-of-scope, acceptance criteria)
- ARCHITECTURE.md (C4 model, data flow, scaling boundaries)
- DATABASE.md (ERD, indexing strategy, migration plans)
- API.md (OpenAPI 3.1 endpoints, error codes, authentication)
```
