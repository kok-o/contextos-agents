---
name: document-generator
description: >
  Generates project documentation from a single idea. Creates PRD, Architecture,
  Database, API, UI, Roadmap, Tasks, Decision Records, and Project Graph
  using templates. Supports incremental updates.
---

# document-generator

## Overview

Automated technical documentation generator. Transforms initial project ideas and specs into comprehensive PRDs, architecture schemas, API contracts, database ERDs, and roadmap task breakdowns.

## When to Use

Activate during project kickoff (ctx init), new service scaffolding, or when generating baseline technical specs from high-level user requirements.

## Rules & Patterns

You generate project documentation from a user's idea. Use the templates in `templates/` as the structure for each document.

## Workflows & CLI Commands

### Project Initialization (`contextos init`)

Full project initialization. From one user prompt, generate foundational documentation:

1. Ask clarifying questions (see context-os SKILL.md)
2. Select profile and skill pack
3. Generate documents in this order:
   - `docs/PRD.md` - Product Requirements (from template)
   - `docs/ARCHITECTURE.md` - System Architecture
   - `docs/DATABASE.md` - Database Schema
   - `docs/API.md` - API Specification (optional, when backend API layer is present)
   - `docs/UI.md` - UI/UX Specification (optional, when UI layer is present)
   - `docs/ROADMAP.md` - Development Roadmap
   - `docs/TASKS.md` - Task Breakdown
   - `docs/PROJECT_GRAPH.md` - Project Graph
4. Create `docs/decisions/` directory for future ADRs
5. Generate agent configuration via Adapters skill (`contextos export all`)

### Incremental Updates

When project requirements or schemas change:

1. Identify which documents are affected
2. Update only affected documents
3. Show diff of changes to user
4. Update Project Graph if structure changed

### Task Breakdown & Planning (`contextos resolve` & `/plan`)

Generate vertical development tasks from existing PRD and architecture:

1. Read `docs/PRD.md` and `docs/ARCHITECTURE.md`
2. Run `contextos resolve "<task description>"` to resolve minimal required skills
3. Break modules into vertical features and tasks (< 2 hours each)
4. Estimate complexity (S/M/L/XL)
5. Output to `docs/TASKS.md` or task implementation plan

## Template Usage

Each template contains:

- **Section headers** - required sections for the document
- **Placeholder prompts** - `{{description}}` markers that guide content generation
- **Examples** - sample content to illustrate the expected format
- **Validation rules** - what must be present for the document to be valid

When generating a document:

1. Read the template
2. Fill in each section based on the user's idea and clarifying answers
3. Replace all `{{placeholders}}` with real content
4. Remove the template comments (lines starting with `<!-- -->`)
5. Validate: ensure all required sections are present

## Document Dependencies

```
PRD.md
  ├── ARCHITECTURE.md
  │     ├── DATABASE.md
  │     ├── API.md
  │     └── DEPLOYMENT.md
  ├── UI.md
  ├── ROADMAP.md
  │     └── TASKS.md
  └── PROJECT_GRAPH.md
```

When updating a parent document, check if child documents need updates too.


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.
