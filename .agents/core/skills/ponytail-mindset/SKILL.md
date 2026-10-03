---
name: ponytail-mindset
description: Choose a minimal maintainable implementation for substantive Build tasks while preserving safety and verification.
---

# ponytail-mindset

## Overview

Reduce unnecessary code and dependencies without weakening correctness or security.

## When to Use

Substantive implementation and refactoring during Build.

## Rules & Patterns

Before adding code, check whether the feature is needed and whether existing code, the standard library, the platform, or an installed dependency handles it. Then implement the smallest readable solution. Avoid premature abstractions. Preserve validation, authorization, parameterized queries, meaningful error handling, and required tests.

The 7-rung ladder: YAGNI; reuse project code; standard library; native platform;
installed dependencies; a readable one-liner; the minimum maintainable code.

Read [references/minimalism.md](references/minimalism.md) for detailed procedures and examples only when needed.

## Code Examples

Reuse the existing date formatter. A shorter database query still needs authorization and validated input.

## Validation Checklist

- [ ] The requested outcome is handled.
- [ ] Relevant verification and safety boundaries are preserved.
- [ ] Limitations are stated.

## Common Mistakes

Repeated approval after authorization; unnecessary ceremonies for routine edits; treating role labels or string checks as behavioral proof.

## Integration Notes

Load relevant domain skills and supporting resources on demand. Compatibility identifiers remain available.
