# Context Loading Rules

## Task Type → Document Mapping

| Task Type | Level 1 (Always) | Level 2 (If exists) | Level 3 (Per task) |
| --- | --- | --- | --- |
| **New project** | PRD, ROADMAP | ARCHITECTURE, DATABASE, API | UI, TASKS, all relevant skills |
| **New feature** | PRD | ARCHITECTURE, API | PROJECT_GRAPH, relevant skills |
| **Frontend** | — | ARCHITECTURE, API | UI, frontend skills |
| **Backend** | — | ARCHITECTURE, DATABASE, API | backend skills |
| **Database** | — | ARCHITECTURE, DATABASE | — |
| **Bugfix** | — | — | PROJECT_GRAPH (affected module only) |
| **Refactor** | — | ARCHITECTURE | PROJECT_GRAPH, affected skills |
| **Review** | PRD | ARCHITECTURE | TASKS, all loaded skills |
| **Deploy** | — | ARCHITECTURE | DEPLOYMENT, infrastructure skills |

## Skill Category → Document Mapping

| Skill Category | Required Documents | Optional Documents |
| --- | --- | --- |
| `frontend` | UI.md, API.md | ARCHITECTURE.md |
| `backend` | API.md, DATABASE.md | ARCHITECTURE.md |
| `design` | UI.md | PRD.md |
| `architecture` | ARCHITECTURE.md, DATABASE.md | PRD.md, API.md |
| `infrastructure` | ARCHITECTURE.md | — |
| `security` | ARCHITECTURE.md, API.md | DATABASE.md |
| `testing` | API.md | ARCHITECTURE.md |

## Context Budget

To prevent context window overflow, apply these limits:

| Priority | Max tokens | Content |
| --- | --- | --- |
| 1 (Critical) | 2000 | Current task description + relevant skill instructions |
| 2 (Important) | 3000 | Architecture + API contracts for affected modules |
| 3 (Context) | 2000 | Decision records + project graph (affected branch) |
| 4 (Background) | 1000 | PRD summary + coding rules |

**Total budget: ~8000 tokens of context per task.**

If context exceeds budget:

1. Trim Level 1 docs to summaries only
2. Load only affected sections of Level 2 docs
3. Keep Level 3 (skills) at full detail — they contain the actual instructions

## Module-Based Filtering

When the Project Graph is available, use it to filter context:

```
Task: "Fix appointment reminder bug"
  ↓
Project Graph lookup: "reminder" → module: appointments
  ↓
Appointments depends_on: [patients, auth]
  ↓
Load only:
  - appointments module docs
  - auth module docs (dependency)
  - API.md (appointments section only)
  ↓
Skip:
  - patients module docs (not a dependency for this task)
  - DATABASE.md (no schema change expected)
  - UI.md (backend task)
```
