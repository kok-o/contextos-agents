# {{Project Name}} — Tasks

## Current Sprint: {{sprint_name}}

### In Progress

- [ ] {{task}} `[{{module}}]` `[{{size: S/M/L/XL}}]`

### To Do

- [ ] {{task}} `[{{module}}]` `[{{size}}]`
- [ ] {{task}} `[{{module}}]` `[{{size}}]`

### Done

- [x] {{completed_task}} `[{{module}}]`

---

## Task Format

Each task should include:

- **Description**: What needs to be done
- **Module**: Which Project Graph module this belongs to
- **Size**: S (< 1hr), M (1-4hr), L (4-8hr), XL (> 8hr)
- **Dependencies**: What must be done first
- **Acceptance criteria**: How to know it's done
- **Skills needed**: Which skills the AI should load

### Example Task

```
- [ ] Implement appointment calendar API [appointments] [L]
  Dependencies: auth module, database schema
  Acceptance: CRUD endpoints for appointments, tests passing
  Skills: node, typescript, postgres, testing
```

## Backlog
<!-- Tasks not yet assigned to a sprint -->
- [ ] {{backlog_task_1}}
- [ ] {{backlog_task_2}}
