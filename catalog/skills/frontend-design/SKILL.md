---
name: frontend-design
description: "Design or reshape frontend composition, typography, color and visual identity for a specific product and audience."
license: Apache-2.0; see LICENSE.txt
---

# Frontend design

## Overview

Create a visual direction that fits the product's content, audience and primary
action. Preserve the user's references, brand, stack and existing design system.
This is a ContextOS adaptation of Anthropic's frontend-design skill; see
[source provenance](SOURCES.json) and [license](LICENSE.txt).

## When to Use

Build a new interface, reshape a page, or improve its visual hierarchy. A targeted
accessibility audit belongs to web-design-guidelines; motion work belongs to
animate. These companion skills are optional catalog installations.

## Rules & Patterns

Inspect the page, real content, existing components and tokens first. Identify
what the visitor needs to understand and do. If the brief is incomplete, make a
reasonable reversible design choice and state it; ask only for decisions that
materially change the product.

Choose a coherent composition: content order, a dominant visual element, spacing
rhythm, type roles and palette. Explain the direction briefly, then implement it.
Let the subject suggest the treatment. A dashboard, documentation site and event
page need different hierarchy; a dramatic hero is not a requirement for each.

Use meaningful grouping rather than putting every section in identical cards.
Choose typography for readability, language coverage and character; test long
headlines and actual text. Reuse a suitable existing family. Avoid universal font,
color or radius bans and avoid replacing a requested aesthetic with personal taste.

Write labels that explain the user's action. Include loading, empty, error and
success states where the flow needs them. Keep layout useful on narrow screens,
with keyboard focus, readable contrast and reduced-motion behavior. Use imagery
when it conveys content; never invent customer logos, metrics or testimonials.

## Code Examples

For a course catalog, make course title, level, schedule and enrollment action
easy to compare. A compact list may serve the task better than a decorative card
grid. Keep the existing enrollment route and content model.

## Validation Checklist

- Inspect rendered mobile and desktop layouts, including long content.
- Check reading order, focus, overflow, text contrast and important states.
- Compare the implemented screen to the brief; distinguish visual inspection
  from untested interactions and unsupported performance claims.

## Common Mistakes

Treating a style preference as a correctness rule; generic copy; unnecessary
decoration; changing product scope to fit a visual reference.

## Integration Notes

The catalog supplies guidance, not a component framework or asset service.
Choose implementation tools from the project and available environment. Use
webapp-testing for requested browser verification when installed.
