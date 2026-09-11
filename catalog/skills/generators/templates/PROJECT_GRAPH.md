# {{Project Name}} — Project Graph

## Project

```yaml
name: "{{project_name}}"
type: {{webapp | api | mobile | cli | saas | crm | ecommerce}}
profile: {{startup | enterprise | mvp | hackathon}}
pack: {{skill_pack_name}}
```

## Modules

### {{module_name}}

```yaml
module: {{module_name}}
description: "{{what this module does}}"
features:
  - {{feature_1}}
  - {{feature_2}}
files:
  - src/modules/{{module_name}}/**
skills: [{{skill_1}}, {{skill_2}}]
depends_on: [{{other_module}}]
```

---

<!-- Repeat for each module -->

## Module Dependency Graph

```
{{module_1}} ──depends──▶ {{module_2}}
     │
     └──depends──▶ {{module_3}}
```

## File → Module Mapping

| File Pattern | Module | Skills |
| --- | --- | --- |
| `src/modules/{{module}}/**` | {{module}} | {{skills}} |
| `src/shared/**` | shared | {{skills}} |
| `src/config/**` | config | — |
| `tests/**` | testing | testing |
| `docs/**` | docs | — |

## Feature → Task Mapping

### {{Feature Name}} `[{{module}}]`

- [ ] {{task_1}} → `{{file_path}}`
- [ ] {{task_2}} → `{{file_path}}`
- [ ] {{task_3}} → `{{file_path}}`
