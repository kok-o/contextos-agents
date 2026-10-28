---
name: architecture-diagrams
description: Explain observed system structure or flows with an appropriate
  architecture, sequence or data-flow diagram.
---

# architecture-diagrams

## Overview

Explain observed system structure or flows with an appropriate architecture, sequence or data-flow diagram. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The user needs an architecture map, a sequence diagram, an explanation of boundaries, or an update to an existing diagram.

## Rules & Patterns

Inspect the relevant sources and existing diagram conventions. Identify the question the diagram should answer and the level of detail needed. Distinguish deployed behavior, source-level structure and proposed design.

Show components, owners, trust boundaries and important interactions using consistent labels. Mark inferred or unverified relationships. A textual import is evidence of a dependency, not proof that a runtime call occurred.

Choose the established format when one exists. Mermaid may suit a small engineering explanation; SVG/HTML can suit an interactive view; an exportable figure may need a dedicated renderer. Animation, dark backgrounds and interactive libraries are optional design decisions.

For generated HTML/SVG, encode untrusted labels and avoid executing repository content as markup or script. Preserve useful legends, readable text and a static or reduced-motion view when interaction is included.

## Code Examples

For a document download flow, show the caller, authorization boundary, metadata lookup and storage read in order. Mark an external storage service as unverified if only its configuration was found; do not invent a production topology.

## Validation Checklist

- [ ] Check relationships against sources and label assumptions.
- [ ] Render the chosen format and inspect readable labels, edge direction and layout.

## Common Mistakes

Drawing every file as a service; inventing runtime observations; using motion or a CDN library for a simple static explanation.

## Integration Notes

Optional companion guidance: system-design, graphify. Use it only when relevant and available; the skill does not install tools or authorize external actions.
