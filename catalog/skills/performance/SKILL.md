---
name: performance
description: Investigate web performance with representative measurements and
  targeted changes to loading, rendering, assets and work scheduling.
---

# performance

## Overview

Investigate web performance with representative measurements and targeted changes to loading, rendering, assets and work scheduling. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task concerns a slow page, interaction, load path or resource budget. A small UI edit does not require a full optimization campaign.

## Rules & Patterns

Identify the user-visible problem, environment, build mode and representative data. Use a trace, network report, profile or relevant metric when available; label unmeasured ideas as hypotheses.

Prioritize the demonstrated bottleneck: dependencies in network requests, unnecessary code, large assets, excessive rendering, layout/paint cost or expensive computation. Preserve required behavior and error handling.

Start independent work concurrently only when authorization and inputs are ready. Asset hints, lazy loading, virtualization and caching each have tradeoffs; choose them for the actual path.

Use inexpensive motion properties when visually equivalent and verify costly effects on target browsers/devices. A property or library name alone does not guarantee hardware acceleration or a frame rate.

Compare equivalent runs and report the measured dimension. Smaller transferred code, fewer renders, lower interaction latency and lower hosting cost are different claims.

## Code Examples

If a page is slow because of an image request, measure that path and test the appropriate asset/loading change before adding memoization throughout the app. Preserve a useful loading and error experience.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Verify functional equivalence and the relevant metric under comparable conditions.
- [ ] Report measurement method, variability and untested environments.

## Common Mistakes

Claiming speed from a diff; optimizing an unrelated code path; introducing user-data cache leaks; treating a lab score as all-user evidence.

## Integration Notes

Optional companion guidance: vercel-react-best-practices, animation-performance, webapp-testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
