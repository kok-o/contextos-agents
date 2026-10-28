---
name: ui-ux-pro
description: Design or review product interaction flows, information structure,
  interface states and usable task completion.
---

# ui-ux-pro

## Overview

Design or review product interaction flows, information structure, interface states and usable task completion. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A product flow, form, navigation, onboarding or information-architecture problem needs design work. Use frontend-design for visual composition and a requested style pack for a specific aesthetic.

## Rules & Patterns

Identify the user's goal, relevant content, constraints and current workflow. Preserve useful product behavior and distinguish observed user evidence from assumptions.

Make actions, navigation, labels and state transitions understandable. Match vocabulary to the user's task and keep names consistent across controls, feedback and recovery.

Design loading, empty, invalid, denied and success states where the flow needs them. Preserve entered data for recoverable failures, prevent unintended duplicate actions, and offer confirmation or undo where the actual operation warrants it.

Respect the brand, component system, typography and platform conventions. Fonts, pure colors, native controls and particular easing curves are not universally prohibited.

Check keyboard/touch access, focus, content reflow and reduced-motion behavior. A style checklist or screenshot does not establish usability research or accessibility certification.

## Code Examples

For a multi-step application form, keep progress and recovery clear, preserve input after a failed save and distinguish optional onboarding from required legal/security steps. Do not make every step skippable by default.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise the primary task and important recovery paths.
- [ ] Check actual content, navigation, focus and responsive states.

## Common Mistakes

Replacing UX with font bans; inventing user research; removing required steps to simplify the flow; confusing visual polish with task success.

## Integration Notes

Optional companion guidance: frontend-design, web-design-guidelines, webapp-testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
