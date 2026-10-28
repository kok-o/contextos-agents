---
name: review-animations
description: "Review existing web motion for purpose, timing, continuity, interruption, accessibility and performance evidence."
license: MIT; see LICENSE.txt
---

# Review web motion

## Overview

Assess whether motion helps the interaction and behaves correctly. This
ContextOS adaptation draws on Emil Kowalski's review guidance; see
[source provenance](SOURCES.json) and [license](LICENSE.txt).

## When to Use

Review existing animations, a motion diff or an interface's transitions. Include
the motion portion of a broader review without declining the rest of the user's
request. A review does not authorize unrelated implementation changes.

## Rules & Patterns

Inspect the affected components, motion tokens and user flow. Look for a clear
purpose, appropriate frequency, coherent origin/direction, readable movement and
responsive feedback. Respect a requested aesthetic and existing design language.
Duration and easing preferences need context; do not manufacture a defect merely
because an implementation differs from a favorite curve or timing table.

Exercise interruption: rapid activation, reversal, route changes, unmount and
simultaneous items. Check stale callbacks, duplicate effects, abrupt resets and
exit state. Verify focus, semantic visibility, keyboard operation and reduced
motion separately from the visual effect. Decorative exits must not leave
invisible interactive elements or delay the logical completion of an action.

Treat transition: all and layout-heavy effects as investigation leads. Identify
the actual changed properties and affected surface. Claim dropped frames or a
performance improvement only with relevant browser/device evidence; otherwise
explain the risk and the measurement that would resolve it.

Prioritize user-visible bugs and accessibility barriers over optional polish.
For each finding, give the location, triggering sequence, observed consequence
and a proportionate fix. Mark taste suggestions as optional and avoid duplicate
findings for one root cause. A clean scoped review is a valid result.

## Code Examples

If closing and immediately reopening a drawer lets an old completion callback
hide the reopened drawer, report that sequence and the callback location. A
different preferred easing alone does not establish the same kind of defect.

## Validation Checklist

- Cover the relevant normal, interrupted, reduced-motion and focus paths.
- State which checks used source inspection, browser observation or profiling.
- Report untested browsers/devices and avoid treating a checklist as approval
  of the entire application.

## Common Mistakes

Defaulting to findings without evidence; categorical animation bans; treating
subjective taste as a blocking defect; rewriting unrelated UI during a review.

## Integration Notes

Use animate for an authorized implementation and animation-performance for a
specific bottleneck, when those catalog skills are installed. The review remains
useful without either companion or a particular animation framework.
