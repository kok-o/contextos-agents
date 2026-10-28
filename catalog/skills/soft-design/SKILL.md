---
name: soft-design
description: Apply a requested soft, tactile visual direction with restrained
  surfaces, typography and motion.
---

# soft-design

## Overview

Apply a requested soft, tactile visual direction with restrained surfaces, typography and motion. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The brief asks for soft, tactile or similarly expressive styling. It is not a general definition of an expensive or high-quality interface.

## Rules & Patterns

Interpret the brand and real content first. Soft surfaces, gentle depth and rounded forms can support the direction without making every component a card or reducing information hierarchy.

Reuse suitable typography and tokens. Imported web fonts, fixed colors, blur and shadows are optional tools; consider language coverage, loading behavior and the existing product.

Keep text and controls readable against layered surfaces. Test focus and state differences rather than assuming decorative depth provides an affordance or accessible contrast.

Limit costly effects to places where they help, measure when performance is in scope, and provide reduced-motion behavior. Preserve standard component semantics and useful native controls.

## Code Examples

A tactile settings panel can use a small amount of depth while keeping labels, selected state and error feedback clear. A chart or dense table may need flatter treatment even within the same brand.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Inspect actual content, contrast, focus and narrow layouts.
- [ ] Check that decorative effects preserve interaction and do not distract from the task.

## Common Mistakes

Equating shadows/blur with quality; forcing font downloads; making all content low-contrast; adding motion everywhere.

## Integration Notes

Optional companion guidance: frontend-design, web-design-guidelines. Use it only when relevant and available; the skill does not install tools or authorize external actions.
