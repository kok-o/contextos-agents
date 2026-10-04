# context-os

## Overview

Guide configuration of the ContextOS compiler, resolver, profiles, and agent exports. Executable behavior lives in the CLI and modules; this Markdown entrypoint is guidance.

## When to Use

Skill selection, context budgets, manifests, project overrides, profiles, exports, and configuration drift.

## Rules & Patterns

Inspect the active project and installed skills. Canonical sources live in .agents/core/skills; project overrides in .agents/project/skills; plugins provide additional sources. Native .agents/skills contains generated projections. Entrypoint precedence is skill.v2.yaml, skill.yaml, then manifestless SKILL.md. Respect the declared entrypoint and resolve contained resource paths relative to its skill directory.

Use the resolver with the task and affected files; inspect reasons, risk, warnings, missing skills, and soft-budget overflow. Load references only when needed. Existing authorization and proportional engineering-workflow apply.

Read [references/context-rules.md](references/context-rules.md) for budgeting and [references/project-graph.md](references/project-graph.md) for graph limits.

## Code Examples

In this source checkout: node .agents/ctx.js resolve "Fix IDOR" --files src/auth.ts --json. See EXAMPLES.md for source and consumer command boundaries.

## Validation Checklist

- [ ] The requested outcome and applicable failure cases are checked.
- [ ] Evidence names commands, results, scope, and limitations.
- [ ] Unrelated changes and existing authorization are preserved.

## Common Mistakes

Editing generated projections; assuming catalog skills are installed; treating an estimated budget as total prompt size; expecting AST or document selection from the package graph; claiming schema validation proves agent behavior.

## Integration Notes

context-manager is a deprecated compatibility alias. engineering-workflow owns the lifecycle; security owns protected boundaries. packs.yaml and rules.yaml are reference data, not executable policy.
