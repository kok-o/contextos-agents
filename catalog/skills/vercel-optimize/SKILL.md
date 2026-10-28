---
name: vercel-optimize
description: Investigate Vercel hosting performance or cost using supplied
  observations, scoped source inspection and version-aware platform guidance.
metadata:
  version: 1.2.0
---

# vercel-optimize

## Overview

Investigate Vercel hosting performance or cost using supplied observations, scoped source inspection and version-aware platform guidance. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task concerns a Vercel deployment, slow/expensive routes or hosting usage. It may use Next.js or another supported framework; no Next.js instruction dependency is required.

## Rules & Patterns

Inspect project/framework versions and available authenticated tooling. Read-only telemetry access and configuration/deployment changes have different authorization boundaries. Do not expose tokens in commands, examples or logs.

Use real supplied/exported observations for production conclusions. The bundled collect-signals script imports JSON with --input or emits explicitly labeled --demo fixtures; it does not fetch live telemetry. Provenance labels are not source authentication.

The gate generates investigation candidates, not verified recommendations or savings. Synthetic input is rejected unless --allow-demo is explicit and remains labeled through merge. Code-only routes have missing measurements rather than invented zero traffic.

Inspect the relevant route and imports even when telemetry is unavailable, but label conclusions as static hypotheses. The scanner uses textual heuristics; confirm framework routing, matcher and runtime behavior from source and versioned documentation.

Caching needs an affirmative public-data policy, correct key identity, freshness and invalidation. Do not propose shared caching for private/auth-sensitive data or shorten long-lived workflow execution based on its duration alone.

## Code Examples

Import a reviewed telemetry JSON file, optionally correlate it with a code scan, then inspect the candidate's actual boundary. A --demo run can test the pipeline but cannot justify a production cost or latency claim.

## Validation Checklist

- [ ] Verify project scope, observation window, provenance and the actual changed route.
- [ ] Measure relevant results under comparable conditions and preserve authorization/cache correctness.

## Common Mistakes

Presenting fixture numbers as production telemetry; claiming savings from a text scan; forcing a cache/runtime choice from another framework version.

## Integration Notes

Optional companion guidance: performance, security, vercel-react-best-practices. Use it only when relevant and available; the skill does not install tools or authorize external actions.
