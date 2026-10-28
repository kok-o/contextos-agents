---
name: brutalist-design
description: Apply an explicitly requested brutalist or industrial visual
  direction while preserving readability and interaction quality.
---

# brutalist-design

## Overview

Apply an explicitly requested brutalist or industrial visual direction while preserving readability and interaction quality. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The brief requests brutalist, industrial, blueprint-like or similarly deliberate visual styling. It is a style option, not a default for dashboards.

## Rules & Patterns

Translate the brief into a clear grid, typographic hierarchy and restrained structural details. Strong rules, exposed alignment and utilitarian labels can support the style without making every surface visually loud.

Respect supplied brand assets and existing components. Square corners, monospace accents and limited palettes are options, not correctness requirements. Do not reject a requested color, readable system font or rounded control solely because of this style guide.

Keep dense information scannable, controls identifiable and content usable at narrow widths and zoom. Decorative distress, scan lines or glitch effects must not obscure labels, status, focus or data.

Use motion only for a purpose in the actual interaction. Provide reduced-motion behavior and avoid persistent distraction. A visual style does not guarantee any accessibility conformance level.

## Code Examples

An equipment-status page can use a strong grid and technical labels while keeping alarms readable through text and icons as well as color. A mobile control remains a normal accessible control rather than a decorative terminal command.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Compare the result to the requested aesthetic and real content.
- [ ] Inspect keyboard focus, contrast, narrow layout and long labels.

## Common Mistakes

Applying the style to an unrelated task; turning every element into decoration; claiming AAA contrast without measurement.

## Integration Notes

Optional companion guidance: frontend-design, web-design-guidelines. Use it only when relevant and available; the skill does not install tools or authorize external actions.
