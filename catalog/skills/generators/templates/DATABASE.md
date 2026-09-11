# {{Project Name}} — Database Schema

## Database Engine

{{e.g., PostgreSQL 16}}

## Entity Relationship Diagram

```
{{ER_diagram}}
```

## Tables

### {{table_name}}

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| {{column}} | {{type}} | {{constraints}} | {{description}} |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**

- `idx_{{table}}_{{column}}` ON ({{column}})

**Relations:**

- {{table_name}}.{{fk_column}} → {{related_table}}.id

## Migrations Strategy
<!-- How are schema changes applied? -->
- Tool: {{e.g., Prisma Migrate, Alembic, Knex}}
- Naming: `YYYYMMDD_HHMMSS_description`
- Rule: Never modify existing migrations, always create new ones

## Seed Data
<!-- What data needs to exist for the app to work? -->

## Performance Considerations
<!-- Indexes, query optimization, connection pooling -->
