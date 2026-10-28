---
name: animate
description: "Implement purposeful web animations and transitions, including interruption, exit behavior and reduced-motion support."
license: MIT; see LICENSE.txt
---

# Build web motion

## Overview

Make state changes easier to follow while keeping interaction responsive. This
ContextOS adaptation draws on Emil Kowalski's animation guidance; see
[source provenance](SOURCES.json) and [license](LICENSE.txt).

## When to Use

Create or change animations, transitions and interactive motion. Use
animation-performance for a measured smoothness problem and review-animations
for a requested motion review. Do the user's implementation task directly;
loading this skill is not a reason to return a greeting and wait.

## Rules & Patterns

Identify the purpose of motion: feedback, continuity, a state change, explanation
or a brief expressive moment. Match movement to frequency and context. Keep
frequent interactions quick and unobtrusive, but honor explicit user choices;
keyboard initiation alone is not a universal ban on useful feedback.

Reuse motion tokens and the installed stack. A CSS transition often suffices for
a state toggle; WAAPI offers programmatic playback; the existing motion library
may better support layout, gestures or coordinated exits. Do not add a library
for a simple fade or replace the user's chosen library without a concrete need.

Prefer transform and opacity when they produce the intended effect. Keep the
transform origin consistent with the trigger and preserve readable text and
layout. Name transitioned properties. Treat duration and easing as tunable design
choices, not universal correctness constants; existing product tokens come first.

Design rapid reversal, interruption and unmounting. Retarget from the current
visual state and clean up listeners, timers and animation objects. An exit must
not delay semantic closure, trap focus or leave invisible controls interactive.
Preserve a component's established accessibility and lifecycle contracts.

Provide reduced-motion behavior that can remove nonessential movement entirely.
Keep essential state feedback understandable. Gate hover-only effects to suitable
input devices and retain equivalent focus/press feedback.

## Code Examples

For an expanding panel, use its existing disclosure semantics. Toggle the logical
state immediately, animate only the visual change, and handle reopening during
an exit. Use the [implementation checks](references/motion.md) for detail.

## Validation Checklist

- Exercise open, close, rapid reversal and navigation/unmount.
- Check focus, pointer/keyboard behavior and reduced-motion mode.
- Inspect motion in a browser when possible; distinguish code review from a
  measured frame-rate or device-smoothness claim.

## Common Mistakes

Animating every section; transition: all; arbitrary timing bans; replacing
accessible component behavior with a decorative wrapper; assuming CSS always
runs independently of the main thread.

## Integration Notes

Companion skills are optional catalog installations. Native APIs and existing
components remain valid; no external library is required by this skill.
