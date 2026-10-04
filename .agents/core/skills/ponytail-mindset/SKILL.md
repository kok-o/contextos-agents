---
name: ponytail-mindset
description: "Choose a minimal maintainable implementation for substantive Build tasks while preserving safety and verification."
---

# ponytail-mindset

## Overview

Reduce unnecessary code and dependencies without weakening correctness or security.

## When to Use

Substantive implementation, refactoring, and reviews of complexity.

## Rules & Patterns

Before adding code, consider YAGNI, project reuse, the standard library, native platform features, installed dependencies, a readable one-liner, then the minimum maintainable code. Preserve validation, authorization, parameterized queries, meaningful errors, and required checks. Single-use helpers are allowed when they clarify a concept or boundary.

Read [references/minimalism.md](references/minimalism.md) when a tradeoff needs detail.

## Code Examples

Reuse the installed date formatter. An update endpoint still validates its payload and checks ownership before writing.

## Validation Checklist

- [ ] The requested outcome and applicable failure cases are checked.
- [ ] Evidence names commands, results, scope, and limitations.
- [ ] Unrelated changes and existing authorization are preserved.

## Common Mistakes

Code-golf; deleting safety checks; choosing a new component library by default; duplicating access-control logic solely to obey a reuse count.

## Integration Notes

engineering-workflow chooses verification by risk; security defines protected boundaries. This skill chooses implementation size and readability.
