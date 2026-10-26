---
name: context-manager
description: "Compatibility alias for context-os context selection and budgeting."
---
# context-manager

## Overview

Deprecated compatibility identifier. Use [context-os](../context-os/SKILL.md) for the canonical instructions.

## When to Use

An existing configuration or user explicitly names context-manager. Skip loading this body if context-os is already available.

## Rules & Patterns

Apply the canonical skill without loading a duplicate process. Existing authorization, proportional verification, and optional role declarations carry forward. The resolver redirects this identifier and reports an alias warning.

## Code Examples

Explicit context-manager selection resolves to context-os; inspect the resolver result rather than assuming both bodies were loaded.

## Validation Checklist

- [ ] Resolution selects context-os once and reports the alias redirect.
- [ ] The canonical entrypoint and compatibility reference are accessible in the installed/exported tree.

## Common Mistakes

Treating this compatibility name as an independent engine or a mandatory ceremony.

## Integration Notes

Keep legacy links available. Read [references/context-rules.md](references/context-rules.md) only for compatibility details.
