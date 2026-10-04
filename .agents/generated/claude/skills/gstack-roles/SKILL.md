# gstack-roles

## Overview

Deprecated compatibility identifier. Use [engineering-workflow](../engineering-workflow/SKILL.md) for the canonical instructions.

## When to Use

An existing configuration or user explicitly names gstack-roles.

## Rules & Patterns

Apply the canonical skill without loading a duplicate process. Existing authorization, proportional verification, and optional role declarations carry forward. The resolver redirects this identifier and reports an alias warning.

## Code Examples

Explicit gstack-roles selection resolves to engineering-workflow; inspect the resolver result rather than assuming both bodies were loaded.

## Validation Checklist

- [ ] Canonical guidance is used.
- [ ] Alias resolution adds no duplicate body.
- [ ] Evidence scope and limitations are stated.

## Common Mistakes

Treating this compatibility name as an independent engine or a mandatory ceremony.

## Integration Notes

Keep legacy links available. Read [references/roles.md](references/roles.md) only for compatibility details.
