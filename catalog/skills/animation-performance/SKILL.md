---
name: animation-performance
description: "Diagnose web animation stutter, dropped frames and expensive rendering using traces, then verify a targeted fix."
license: MIT; see LICENSE.txt
---

# Diagnose animation performance

## Overview

Find the work that prevents frames from completing in time. This ContextOS
adaptation references Emil Kowalski's animation-performance skill; see
[source provenance](SOURCES.json) and [license](LICENSE.txt).

## When to Use

An animation stutters, lags during navigation, consumes excessive rendering work,
or needs a property/tool choice grounded in performance. Use animate for creating
motion and review-animations for evaluating its purpose and feel.

## Rules & Patterns

Reproduce a specific interaction and note browser, device, viewport, build mode
and load. Capture a Performance trace or equivalent evidence when available.
Separate JavaScript/React work, style recalculation, layout, paint/rasterization
and compositing. If no profiler is available, label a diagnosis as a hypothesis.

Use transform and opacity where visually equivalent. Avoid repeated layout reads
after writes, broad inherited CSS variable updates and state updates every frame.
Keep real application state in React while using an appropriate transient motion
mechanism for frame-by-frame visual values. Preserve cleanup and state ownership.

Check large moving surfaces, filters, shadows, blur, SVG and image decoding.
Their cost depends on browser, affected area and device; do not promise that a
particular filter or a CSS/WAAPI animation is automatically GPU-accelerated.
Moving a busy JavaScript loop into CSS only helps if the remaining animation
work can actually run cheaply.

Use will-change only for a demonstrated promotion problem and with a bounded
lifetime; persistent layers consume resources. Prefer removing unnecessary work
before adding layers. Match investigation to the target refresh rate: the nominal
frame interval is 1000 / refresh-rate milliseconds, not an execution guarantee.

## Code Examples

If a drawer drops frames only while a large result list renders, profile that
render and the drawer together. A compositor-friendly drawer does not make the
list's JavaScript free. Compare the same interaction before and after one fix.

## Validation Checklist

- Retest under comparable device, data, load and build conditions.
- Preserve the intended motion, interaction correctness and reduced-motion mode.
- Report the observed bottleneck, change and measured result; distinguish
  smoother local playback from evidence on untested devices or browsers.

## Common Mistakes

Adding will-change everywhere; assuming a library name proves acceleration;
claiming a fixed frame rate from code inspection; hiding a correctness problem
by dropping required content or interactions.

## Integration Notes

Use the project's browser/profiler facilities. This skill requires no particular
framework, performance package or new dependency. A trace is evidence for its
recorded conditions, not a guarantee for every client.
