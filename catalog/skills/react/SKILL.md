---
name: react
description: Implement and review React components, state ownership, effects,
  identity and lifecycle behavior in the existing application.
---

# react

## Overview

Implement and review React components, state ownership, effects, identity and lifecycle behavior in the existing application. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The project uses React. Respect its installed version, rendering environment, state utilities and compiler configuration.

## Rules & Patterns

Keep state near the components that own it and derive render-only values during rendering. Use effects to synchronize external systems; put interaction-specific work in the relevant event path when appropriate.

Preserve component identity and use stable keys when items can move or change identity. Avoid defining a stateful component type inside another component's render path.

Use immutable state updates and clean up subscriptions, timers and owned external resources. Handle stale async results and unmounting according to the application's data/lifecycle strategy.

Measure expensive rendering before adding memoization everywhere. Account for the actual compiler and context/subscription behavior. Do not force a state library or TypeScript migration for a local component change.

Preserve semantic controls, keyboard behavior, loading/error states and server/client boundaries. A correct pure state helper does not prove the rendered interaction or server persistence works.

## Code Examples

For a filtered list, derive the filtered result from current input rather than storing a second copy in an effect. For a browser subscription, keep the effect and its cleanup; the absence of effects is not a goal in itself.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise relevant state changes, identity, unmount and error cases.
- [ ] Run appropriate component/browser and type/build checks for the change.

## Common Mistakes

Blanket useMemo/useCallback; using effects for every derived value; moving all state global; replacing the existing data layer without a task need.

## Integration Notes

Optional companion guidance: typescript, state-management, vercel-react-best-practices. Use it only when relevant and available; the skill does not install tools or authorize external actions.
