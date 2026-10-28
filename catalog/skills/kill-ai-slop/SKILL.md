---
name: kill-ai-slop
description: "Review or refine generic AI-styled interfaces and UI copy using product intent, real content and observed usability."
license: Apache-2.0; see LICENSE.txt
---

# Kill AI Slop

## Overview

Find template decisions that weaken a particular interface and make focused
improvements. This ContextOS adaptation of yetone/kill-ai-slop is substantially
rewritten; see [provenance](SOURCES.json) and [license](LICENSE.txt).

## When to Use

Use when asked to remove an AI look, de-slop an interface, make a generic page
more specific, or audit repetitive UI and product copy. Do not run a redesign
for an unrelated bug fix. Use humanizer for prose-only editing when installed.

## Rules & Patterns

Inspect the brief, actual content, existing design system, components and running
screen when available. Identify the user's main action and the content hierarchy.
Preserve requested aesthetics, brand tokens, interactions and accessibility.
Review-only requests produce findings; implementation requests authorize scoped
fixes. Ask only for missing choices that materially affect the result.

Look for repeated gradient headlines, glow on every surface, unnecessary glass,
identical feature cards, badges without meaning, flat type hierarchy, and the
same hero-to-features-to-testimonials sequence regardless of content. Examine
repetitive reveal animations and decorative dashboards with invented live data.
These are candidates for inspection, not automatic violations. Gradients, common
fonts, rounded corners, symmetry and conventional layouts can serve the product.

For each finding, connect the element to a concrete problem: competing emphasis,
poor scanning, unreadable text, misleading status or repetition without new
information. Confirm source-search hits in context and in the rendered page when
possible. Do not infer authorship or produce an invented objective slop score.

Choose improvements from the product: real content, useful grouping, deliberate
type roles and spacing, and imagery that explains something. Remove redundant
decoration before replacing the palette or rebuilding components. Novelty and
asymmetry are optional; a plain, familiar control may be the clearest choice.

Check copy against behavior. Do not fabricate metrics, testimonials, logos,
scarcity or uptime. Mark synthetic demo data. A local form must say that its
confirmation is a demo, not that a real booking, payment or access pass exists.
Use actionable labels and preserve error, empty, loading and success states.

Keep the diff focused. Reuse shared tokens and components where appropriate.
Preserve routes, data handling, keyboard behavior and existing functionality.
Do not remove focus indicators, disable motion preferences or hide horizontal
overflow merely to pass a screenshot check; inspect and fix its cause.

## Code Examples

See [review examples](references/examples.md) for evidence-based findings and
cases where a suspected pattern should be retained.

## Validation Checklist

- Inspect desktop and narrow layouts with actual or long content when possible.
- Exercise changed actions, modal focus on open, Tab containment and focus return.
- Check overflow, contrast, reduced motion and truthful demo states as relevant.
- Report confirmed findings with file locations, rationale and observed checks.
  Distinguish code review, rendered inspection and untested behavior.

## Common Mistakes

Universal style bans; replacing one template with another; changing all colors
without a brief; claiming a regex scan proves visual quality; hiding broken UI.

## Integration Notes

This instruction-only adaptation uses available code search and browser tools;
it does not bundle upstream's scanner or require runtime downloads. Optional
frontend-design helps choose direction; webapp-testing helps verify interactions.
