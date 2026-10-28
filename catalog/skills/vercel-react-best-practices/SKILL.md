---
name: vercel-react-best-practices
description: "Implement and review React or Next.js performance improvements in data fetching, bundles, rendering and client boundaries."
license: MIT; see LICENSE.txt
---

# React and Next.js performance

## Overview

Apply Vercel's performance priorities to the actual React/Next.js version and
execution model. This is a focused ContextOS adaptation; [source provenance](SOURCES.json)
records the upstream guide and [license](LICENSE.txt). Detailed examples live in
[references/performance.md](references/performance.md); read the relevant section.

## When to Use

Author or review React/Next.js components, data loading, server/client boundaries,
or a demonstrated performance problem. Pure visual composition belongs to
frontend-design. Do not introduce Next.js conventions into a different framework.

## Rules & Patterns

Inspect package versions, routing mode, React Compiler configuration and existing
fetch/cache utilities. Identify the slow user action and evidence before a broad
optimization. Prioritize unnecessary network waterfalls and large client bundles
before small JavaScript rewrites.

Start independent requests together when their authorization and inputs are
ready. Preserve ordering where an operation depends on an earlier result. Keep
server-only code and secrets out of client imports; move the interactive boundary
to the smallest useful component. Stream independent slow sections when the
framework and UX support it.

Reduce unused or eagerly loaded client code. Use dynamic loading for genuinely
deferred work and the framework's supported import optimizations. Do not replace
all imports mechanically or defer content needed for the first useful screen.

Keep derived values out of unnecessary effects. Fix unstable subscriptions,
render-time component definitions and expensive repeated work before adding
memoization. Measure memoization or compiler behavior rather than prescribing
useMemo/useCallback on every component.

Cache with explicit identity, lifetime and invalidation. Request deduplication
does not authorize sharing personalized data across users or tenants. Framework
defaults change: verify the installed version before changing caching behavior.

## Code Examples

When independent account and catalog reads are already authorized, start both
before awaiting them. If the catalog query needs an account ID, retain that
dependency. See the fetch and cache cases in the supporting reference.

## Validation Checklist

- Verify equivalent loading, error, empty and authorization behavior.
- Run relevant component/integration checks and a production build.
- Compare an appropriate trace, bundle report or user-facing metric under
  comparable conditions; identify hypotheses when measurement is unavailable.

## Common Mistakes

Claiming a speedup from a code diff; sharing personalized caches; suppressing
hydration warnings to hide a bug; adding a dependency for trivial parallelism.

## Integration Notes

No framework or measurement tool is installed by loading this skill. Reuse the
project's profiler, analyzer and browser tests. No throughput or Web Vitals
improvement is guaranteed by these instructions.
