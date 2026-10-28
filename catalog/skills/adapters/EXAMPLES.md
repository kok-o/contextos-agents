# adapters examples

## Export installed sources once

From an initialized consumer project with the adapters catalog skill installed:

```sh
# Edit project rules in .agents/project/skills/, not native outputs.
contextos compile
contextos export all
contextos export all --check --json
```

In the ContextOS source checkout, substitute `node .agents/ctx.js` for `contextos`.
For the adapters skill's default `auto` activation, the following outputs exist
(other installed skills and declared supporting resources add more files):

```text
.agents/skills/adapters/SKILL.md
.agents/generated/gemini/skills/adapters/SKILL.md
.claude/skills/adapters/SKILL.md
.cursor/rules/adapters.mdc
.github/copilot-instructions.md
.aider.conf.yml
CONVENTIONS.md
.zed/rules.md
.zed/prompts/adapters.md
```

No new `CLAUDE.md`, `.agents/generated/claude/skills/`, or `.cursorrules` is
generated. Existing user files remain user files. Copilot, Aider, and Zed route
to on-demand source skills rather than inlining all bodies.

## Choose path-scoped delivery

For a project skill at `.agents/project/skills/team-policy/`, declare this in
`skill.yaml` beside its actual `SKILL.md` entrypoint:

```yaml
id: team-policy
description: Team TypeScript policy
entrypoint: SKILL.md
activation: globs
globs:
  - src/**/*.ts
```

Compile, export, and check again. Claude now writes
`.claude/rules/team-policy.md` with `paths: ["src/**/*.ts"]`, not an auto skill.
Cursor writes `.cursor/rules/team-policy.mdc` with the glob and
`alwaysApply: false`. Gemini keeps both native skill copies and adds
`.agents/rules/contextos-team-policy.md` with `trigger: glob` (plus bounded
Windows activation files when applicable). Copilot, Aider, and Zed retain routing
references; they do not implement this per-file glob restriction.

Use `activation: always` only for rules that belong in every session: Claude's
rule then has no paths filter, Cursor sets `alwaysApply: true`, Gemini's rule
uses `trigger: always_on`, and Copilot/Aider/Zed inline the body. These assertions
describe rendered artifacts; verify loading separately in the actual client.
