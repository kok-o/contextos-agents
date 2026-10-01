# Project Graph

The Project Graph is the **central nervous system** of ContextOS. It maps the entire project as a hierarchy:

```
Project
  └── Module
        └── Feature
              └── Task
                    └── File
                          └── Skill
```

## Why Project Graph?

Without a Project Graph, an AI agent sees a flat list of files. With it, the agent understands:

1. **Impact analysis** — changing `calendar.ts` affects the Appointments module, which affects Patients
2. **Scope detection** — a task touching `api/patients/` only needs Patient-related context
3. **Skill selection** — files in `components/` need React skills, files in `api/` need backend skills
4. **Dependency tracking** — the Calendar feature depends on the Auth module

## Structure

The Project Graph lives in `docs/PROJECT_GRAPH.md` and follows this format:

```yaml
project:
  name: "DentalCRM"
  type: crm

modules:
  patients:
    description: "Patient management"
    features:
      - patient-list
      - patient-profile
      - medical-history
    files:
      - src/modules/patients/**
    skills: [react, typescript, postgres]
    depends_on: [auth]

  appointments:
    description: "Appointment scheduling"
    features:
      - appointment-calendar
      - appointment-booking
      - notifications
    files:
      - src/modules/appointments/**
    skills: [react, typescript, postgres]
    depends_on: [patients, auth]

  auth:
    description: "Authentication and authorization"
    features:
      - login
      - registration
      - role-management
    files:
      - src/modules/auth/**
    skills: [security, typescript, jwt]
    depends_on: []
```

## How the Context Compiler Uses It

### Task: "Add a reminder notification for appointments"

1. **Locate module**: `appointments`
2. **Check dependencies**: `appointments` → `patients`, `auth`
3. **Load relevant files**: `src/modules/appointments/**`, `src/modules/notifications/**`
4. **Load relevant skills**: `react`, `typescript`, notification patterns
5. **Load relevant docs**: `ARCHITECTURE.md` (notifications section), `API.md` (endpoints)
6. **Skip irrelevant**: `DATABASE.md` (no schema change), `UI.md` (if backend-only)

### Task: "Refactor the database schema"

1. **Affected modules**: ALL (schema change is cross-cutting)
2. **Load**: `DATABASE.md`, `ARCHITECTURE.md`, `PROJECT_GRAPH.md`
3. **Show impact**: which modules/features are affected by each table change
4. **Load skills**: `postgres` (or relevant DB skill)

## Automatic Updates

The Project Graph should be updated when:

- New modules are added
- Features are completed
- File structure changes significantly
- Dependencies between modules change

Use `ctx graph` to regenerate the Project Graph from the current codebase.

## Graph Queries

The Context Compiler can answer questions like:

- "What modules does this file belong to?"
- "What skills are needed for this module?"
- "What other modules will be affected if I change this?"
- "Show me the dependency chain from here"
