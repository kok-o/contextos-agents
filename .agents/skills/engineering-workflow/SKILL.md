---
name: engineering-workflow
description: >
  Scope implementation work, verify behavior, and report evidence using a proportional lifecycle.
---
# engineering-workflow

## Overview

Define the outcome, plan substantial changes, implement, verify, review, and report. Existing user authorization carries forward.

## When to Use

Implementation, debugging, reviews, and release preparation. Routine maintenance and diagnostics use targeted checks.

## Rules & Patterns

Establish acceptance criteria for substantial or ambiguous work. Ask only for missing decisions affecting scope, safety, or external actions. An implementation request authorizes ordinary reversible work. Inspect affected code and callers, preserve unrelated changes, and verify behavior before reporting completion. Roles are optional.

Read [references/workflow.md](references/workflow.md) for procedures when needed.

## Code Examples

A README typo needs a small edit and formatting check. An authorization fix needs an allowed-user case and a denied-user regression.

## Validation Checklist

- [ ] The requested outcome and applicable failure cases are checked.
- [ ] Evidence names commands, results, scope, and limitations.
- [ ] Unrelated changes and existing authorization are preserved.

## Common Mistakes

Repeated approval after authorization; full ceremonies for routine edits; treating headings, role labels, or schema checks as behavioral proof.

## Integration Notes

Use security for sensitive boundaries, ponytail-mindset for implementation complexity, and context-os for compiler/configuration work. gstack-roles is a compatibility alias.
