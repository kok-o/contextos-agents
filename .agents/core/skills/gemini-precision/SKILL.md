---
name: gemini-precision
description: "Execution guidance for Gemini: inspect code, preserve scope, and report relevant verification evidence."
---

# gemini-precision

## Overview

Apply inspection and execution discipline when working with Gemini. Model-specific quality or performance gains require separate measured comparisons.

## When to Use

Gemini implementation and debugging tasks, or an explicit request for this guidance. Skip for other models unless requested, and for routine prose edits.

## Rules & Patterns

Before using an unfamiliar API, inspect its actual export, signature, installed version, and a caller. Distinguish a plausible example from an available project symbol. After a tool failure, inspect the exit result and affected files before retrying; avoid repeating a write whose outcome is unknown. Report a pure helper at its actual boundary, and verify persistence or an external effect separately when required. Use engineering-workflow for planning, authority, and check selection.

Read EXAMPLES.md for a runnable validation example and its limits.

## Code Examples

A validated calculation can be verified in isolation. It does not prove a payment was persisted or executed.

## Validation Checklist

- [ ] Imports and API signatures come from inspected project code or installed documentation.
- [ ] Failed tool calls have a known outcome before any retry that could duplicate a write.
- [ ] Reported integration effects have evidence beyond a successful helper calculation.

## Common Mistakes

Guessing imports; declaring success without relevant evidence; repeated role banners; running every project gate for a typo; presenting model-specific gains without measurement.

## Integration Notes

engineering-workflow owns the lifecycle, ponytail-mindset owns complexity choices, and security owns protected boundaries. This guidance supplements those skills for Gemini.
