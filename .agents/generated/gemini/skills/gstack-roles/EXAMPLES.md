# gstack-roles Examples — Anti-patterns vs ContextOS Standard

## Example 1: Specialist Persona Activation

### Anti-pattern: Undifferentiated Generalist Response

```text
User: "Should we migrate our monolithic PostgreSQL database to MongoDB?"
Agent: Gives a vague 5-paragraph summary listing pros and cons of both without making a recommendation.
```

### Best practice: ContextOS Standard (Architect Role Declaration)

```markdown
[DOMAIN: Architecture] [PHASE: Plan] [ROLE: Database Architect]
Skills loaded: database, system-design, decisions

### Recommendation: Stay with PostgreSQL. Do NOT migrate to MongoDB.
1. Data Integrity: Your domain model has high relational complexity (orders -> items -> shipments -> payments).
2. Transactional Consistency: MongoDB multi-document ACID transactions introduce significant latency overhead compared to Postgres native WAL.
3. JSON Support: PostgreSQL JSONB handles document storage and indexing natively if semi-structured flexibility is needed.
Decision: Draft ADR 0004-retain-postgresql-with-jsonb.md.
```
