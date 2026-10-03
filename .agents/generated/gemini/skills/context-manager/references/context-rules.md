# Context Loading Rules

Guidelines and deterministic decision tables for selecting, prioritizing, and budgeting context during AI agent execution.

## Task Type to Document Mapping

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

## Skill Category to Document Mapping

| Skill Category | Required Documents | Optional Documents |
| --- | --- | --- |
| `frontend` | UI.md, API.md | ARCHITECTURE.md |
| `backend` | API.md, DATABASE.md | ARCHITECTURE.md |
| `design` | UI.md | PRD.md |
| `architecture` | ARCHITECTURE.md, DATABASE.md | PRD.md, API.md |
| `infrastructure` | ARCHITECTURE.md | — |
| `security` | ARCHITECTURE.md, API.md | DATABASE.md |
| `testing` | API.md | ARCHITECTURE.md |

## Context Budgeting

To prevent context window saturation and retain maximum LLM reasoning capacity, adhere strictly to the following 4-tier token budget:

| Priority Level | Max Tokens | Contents |
| --- | --- | --- |
| 1 (Critical) | 2,000 | Current task description, active brief, and primary skill rules |
| 2 (Important) | 3,000 | System architecture and API contracts for affected modules |
| 3 (Context) | 2,000 | Architectural Decision Records (ADRs) and relevant graph nodes |
| 4 (Background) | 1,000 | PRD summary and global project conventions |

**Total target context budget: ~8,000 tokens per subtask.**

### Degradation Strategy When Over Budget

If accumulated context exceeds the 8,000 token limit:

1. **Trim Level 1 documents** to high-level executive summaries.
2. **Slice Level 2 documents** to extract only sections matching touched module signatures.
3. **Preserve Level 3 skills** at full fidelity, as they contain non-negotiable operational instructions and validation guardrails.

## Module-Based Filtering via Dependency Graph

When `PROJECT_GRAPH.md` or `.graphify/graph.json` is present, traverse dependency edges to filter candidate documents:

1. Identify the primary module for the task from the symbol/path mapping.
2. Resolve immediate inbound and outbound dependencies (`dependencies` and `dependents`).
3. Include documents solely for the identified module and its immediate dependencies.
4. Exclude orthogonal domain documents (for example, omit database schemas during purely presentation-layer CSS/layout tasks).
