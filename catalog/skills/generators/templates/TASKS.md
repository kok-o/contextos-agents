# {{Project Name}} - Tasks

## Current Sprint: {{sprint_name}}

### In Progress

- [ ] {{task}} `[{{module}}]` `[{{size: S/M/L/XL}}]`

### To Do

- [ ] {{task}} `[{{module}}]` `[{{size}}]`
- [ ] {{task}} `[{{module}}]` `[{{size}}]`

### Done

<!-- Add only actually completed tasks, with verification evidence. -->

---

## Task Format

Include fields that help this project plan and verify the task:

- **Description**: What needs to be done
- **Module**: Which Project Graph module this belongs to
- **Size**: Optional relative estimate using the team's scale; not a time promise
- **Dependencies**: What must be done first
- **Acceptance criteria**: How to know it's done
- **Skills needed**: Which skills the AI should load

### Example Task

```
- [ ] Implement appointment calendar API [appointments] [L]
  Dependencies: auth module, database schema
  Acceptance: CRUD endpoints for appointments, tests passing
  Skills: node, database, testing (if installed and relevant)
```

## Backlog
<!-- Tasks not yet assigned to a sprint -->
- [ ] {{backlog_task_1}}
- [ ] {{backlog_task_2}}
