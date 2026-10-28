---
name: redesign-audit
description: Assess and implement a requested redesign of an existing interface
  while preserving its content and functional contracts.
---

# redesign-audit

## Overview

Assess and implement a requested redesign of an existing interface while preserving its content and functional contracts. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The user wants an existing site/app redesigned or polished. A review-only request calls for findings, not an unsolicited rewrite.

## Rules & Patterns

Inspect the current routes, content, component system, design constraints and working user flows. Establish the intended visual/UX improvement and keep unrelated product or backend changes out of scope.

Identify the highest-impact issues and apply a coherent direction using existing assets and tokens where suitable. Preserve useful semantics and avoid changing framework, dependencies or navigation merely to fit a mockup.

Review normal, loading, empty, error and long-content states across useful viewports. Choose viewport units, density and motion for actual device behavior rather than blanket CSS bans.

Implement the requested scope and verify affected flows. Separate visual comparison from browser interaction, accessibility and performance evidence; do not call a polished screenshot a complete application test.

## Code Examples

For a catalog redesign, preserve search/filter behavior, destinations and meaningful content while changing hierarchy and layout. Compare the rendered result and rerun the user flows affected by the new components.

## Validation Checklist

- [ ] Compare the result against the brief and the prior working flows.
- [ ] Check responsive layout, keyboard/focus, states and relevant browser assertions.

## Common Mistakes

Replacing a functioning product with a static mockup; expanding a visual request into a stack migration; claiming a universal premium style.

## Integration Notes

Optional companion guidance: frontend-design, ui-ux-pro, webapp-testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
