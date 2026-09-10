# ContextOS Project Graph & Context Management

ContextOS minimizes LLM token consumption and hallucination risk by relying on a statically generated Project Graph instead of raw directory traversal.

## The Source of Truth

The Project Graph is the single source of truth for repository structure and context. It acts as an intermediary layer between the raw filesystem and the LLM context window.

- **Generation**: The graph is constructed by analyzing AST dependencies, resolving module imports, tracking database schemas, and mapping architecture boundaries.
- **Consumption**: The `context-manager` skill consumes this graph to precisely load only the relevant nodes for a given task, dropping irrelevant systems entirely.

## Graph Entities

The graph maps several entity types:
1. **Modules / Files**: Path-based code units.
2. **Dependencies**: Upstream and downstream module links.
3. **Domain Boundaries**: Logical bounded contexts (e.g., `UserAuth`, `PaymentGateway`).
4. **Data Models**: Database schema references (Prisma/Drizzle structures).

## Context Window Protection

By querying the Project Graph rather than reading arbitrary files, ContextOS guarantees that the LLM is supplied with highly targeted context slices. This directly prevents token overflow and ensures focus.
