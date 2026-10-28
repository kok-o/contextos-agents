---
name: impeccable-design
description: Review visual interface quality against the brief, including
  hierarchy, alignment, density, typography and state consistency.
---

# impeccable-design

## Overview

Review visual interface quality against the brief, including hierarchy, alignment, density, typography and state consistency. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The user requests visual review or polish of an existing interface. Use frontend-design to create a direction and web-design-guidelines for usability/accessibility review.

## Rules & Patterns

Inspect the actual screen, brief, content and existing tokens. Evaluate hierarchy, alignment, spacing rhythm, legibility and the relationship between emphasis and user actions.

Use the requested aesthetic as the reference. Fonts, black/gray colors, gradients, radii, cards, native controls and spring motion are not universal defects. Flag a choice when it causes a concrete problem or contradicts the brief.

Check realistic states: long content, missing imagery, loading, errors, disabled controls and responsive layouts. Distinguish a rendering defect from an optional taste suggestion.

Report actionable findings with location, visible consequence and a proportionate improvement. Source review and screenshots have different limits; this document does not implement a deterministic design checker or certify accessibility.

## Code Examples

If every card has equal visual weight and users cannot distinguish the primary action, adjust hierarchy using the existing design system. Do not replace the font or all native controls merely to satisfy a preferred premium aesthetic.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Compare relevant viewport/state captures to the brief.
- [ ] Verify that polish preserves navigation, content and component behavior.

## Common Mistakes

Counting arbitrary anti-pattern rules as proof of quality; replacing a user's style; reporting preference as a blocking bug.

## Integration Notes

Optional companion guidance: frontend-design, web-design-guidelines. Use it only when relevant and available; the skill does not install tools or authorize external actions.
