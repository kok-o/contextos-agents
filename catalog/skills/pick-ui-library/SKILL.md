---
name: pick-ui-library
description: "Choose a frontend component or effects library by task, existing stack, accessibility, bundle cost and maintenance needs."
license: MIT; see LICENSE.txt
---

# Choose a UI library

## Overview

Recommend a suitable library only when it solves a concrete need. This ContextOS
adaptation references Emil Kowalski's curated choices; see [source provenance](SOURCES.json)
and [license](LICENSE.txt). Candidate categories live in
[references/candidates.md](references/candidates.md), loaded only when needed.

## When to Use

The task calls for choosing or comparing UI primitives, charts, motion, drag and
drop, virtualization or similar frontend tooling. Do not turn a normal component
edit into a dependency-selection exercise.

## Rules & Patterns

Read package.json, the lockfile, component wrappers and framework versions first.
Respect an explicitly chosen library and reuse suitable installed components.
Do not replace the user's requested library merely because a curated list names
another one. Native HTML/CSS/JS may already satisfy the need.

Identify the required interaction, accessibility behavior, rendering environment,
styling control and performance constraints. Distinguish an accessible dialog or
menu primitive from an animation engine; visual movement does not supply focus
management, keyboard handling or semantics.

For a real dependency decision, verify current primary documentation, license,
maintenance, framework/server-rendering compatibility and installation path.
Evaluate client bundle/runtime cost for the actual import, rather than quoting
an unsupported universal size. State when current status could not be verified.
Use the candidate reference as a starting point, not an immutable ranking.

Recommend the best fit with a concise reason and the important tradeoff. Compare
alternatives when the requirements leave a meaningful choice. If implementation
is requested, install using the project's package manager, wire the real component
and check loading/error/focus behavior. A recommendation alone does not authorize
a dependency migration or publication.

## Code Examples

For a project already using an accessible dialog primitive, animate its supported
content/presence API instead of replacing it with a hand-built div overlay. For
a simple hover fade, use existing CSS before proposing a motion dependency.

## Validation Checklist

- Confirm required behavior, supported versions, license and integration cost.
- Check SSR/hydration, keyboard/focus and reduced-motion behavior as applicable.
- Distinguish a researched recommendation from an installed and tested component.

## Common Mistakes

Dependency churn; claiming every chart needs the same package; choosing a motion
engine as a substitute for component semantics; presenting a curated preference
as a universal technical requirement.

## Integration Notes

No library is installed by loading this skill. Use animate, frontend-design or
webapp-testing only for the corresponding authorized task and when available.
