# {{Project Name}} — System Architecture

## Architecture Overview
<!-- High-level architecture description and diagram -->

```
{{architecture_diagram}}
```

## Tech Stack

| Layer | Technology | Reason |
| --- | --- | --- |
| Frontend | {{e.g., Next.js + React}} | {{reason}} |
| Backend | {{e.g., Node.js + Express}} | {{reason}} |
| Database | {{e.g., PostgreSQL}} | {{reason}} |
| Cache | {{e.g., Redis}} | {{reason}} |
| Auth | {{e.g., JWT + OAuth2}} | {{reason}} |
| Hosting | {{e.g., Vercel + Railway}} | {{reason}} |

## System Components

### {{Component 1 Name}}

- **Responsibility:** {{what it does}}
- **Interfaces:** {{what it exposes}}
- **Dependencies:** {{what it depends on}}

### {{Component 2 Name}}

- **Responsibility:** {{what it does}}
- **Interfaces:** {{what it exposes}}
- **Dependencies:** {{what it depends on}}

## Data Flow

```
User → Frontend → API Gateway → Service Layer → Database
                                      ↓
                                 Cache Layer
```

## Directory Structure

```
{{project_root}}/
├── src/
│   ├── modules/           # Feature modules
│   │   ├── {{module_1}}/
│   │   └── {{module_2}}/
│   ├── shared/            # Shared utilities
│   ├── config/            # Configuration
│   └── types/             # Type definitions
├── tests/
├── docs/
└── infrastructure/
```

## Security Architecture
<!-- Authentication, authorization, data protection -->

## Scalability Considerations
<!-- How will this scale? What are the bottlenecks? -->

## Error Handling Strategy
<!-- How are errors propagated, logged, and reported? -->

## Key Architectural Decisions
<!-- Reference to ADRs in docs/decisions/ -->
- See `docs/decisions/` for all architectural decisions with rationale
