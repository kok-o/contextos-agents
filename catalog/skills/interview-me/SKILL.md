---
name: interview-me
description: Clarify material requirements and constraints with focused
  questions while progressing from available project context.
---

# interview-me

## Overview

Clarify material requirements and constraints with focused questions while progressing from available project context. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task has a consequential ambiguity, or the user explicitly requests a requirements interview. Routine fixes and clear implementation requests should proceed directly.

## Rules & Patterns

Read the request and relevant project facts first. Distinguish missing information that can be inspected from a decision only the user can make.

Ask concise, answerable questions about scope, success criteria, constraints or meaningful tradeoffs. Offer sensible options when useful, without hiding a free-text answer or steering the product to a preferred stack.

Do independent useful work while a non-blocking question is pending. A missing required authorization is not supplied by elapsed time; a reversible implementation detail can usually be chosen and stated.

Carry existing answers and authorization forward. Do not restart a questionnaire after each phase, require an interview before any code, or turn a small clarification into a full PRD exercise.

## Code Examples

For an ambiguous export request, inspect supported formats and the existing file first, then ask only about a consequential missing destination or output requirement. A typo correction needs no discovery interview.

## Validation Checklist

- [ ] Confirm that each question resolves a real missing decision.
- [ ] Use answers in the implementation rather than repeatedly asking for them.

## Common Mistakes

Asking what the repository already answers; stopping at a plan for an implementation request; treating silence as permission.

## Integration Notes

Optional companion guidance: engineering-workflow. Use it only when relevant and available; the skill does not install tools or authorize external actions.
