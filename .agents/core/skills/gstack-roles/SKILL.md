---
name: gstack-roles
description: Compatibility alias for engineering-workflow with optional specialist review perspectives.
---

# gstack-roles

## Overview

Use specialist perspectives when they reveal concrete issues. The canonical lifecycle skill is engineering-workflow.

## When to Use

Explicit role guidance or a specialist review request.

## Rules & Patterns

Choose the useful perspective: product scope, architecture, implementation, QA, security, or release. Role declarations are optional. Repeated headers and mandatory role switches add no evidence. Existing authorization and routine fast tracks apply.

Read [references/roles.md](references/roles.md) for detailed procedures and examples only when needed.

## Code Examples

For access control, use the security perspective to examine authorization boundaries and negative cases.

## Validation Checklist

- [ ] The requested outcome is handled.
- [ ] Relevant verification and safety boundaries are preserved.
- [ ] Limitations are stated.

## Common Mistakes

Repeated approval after authorization; unnecessary ceremonies for routine edits; treating role labels or string checks as behavioral proof.

## Integration Notes

Load relevant domain skills and supporting resources on demand. Compatibility identifiers remain available.
