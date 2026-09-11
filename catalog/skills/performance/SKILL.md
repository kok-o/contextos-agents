---
name: Web Performance
description: >
  ContextOS skill for Web Performance, Core Web Vitals, waterfall elimination, bundle size optimization, and caching strategies.
---

# Web Performance & Core Web Vitals

## Overview

Enforces high-efficiency frontend and full-stack performance standards to achieve exceptional Core Web Vitals: Largest Contentful Paint (LCP < 2.5s), Interaction to Next Paint (INP < 200ms), and Cumulative Layout Shift (CLS < 0.1).

## When to Use

Activate whenever analyzing, profiling, writing, or optimizing page loading speeds, network waterfalls, script bundling, animation frame rates, or data caching.

## Negative Constraints (What NOT to Do)

1. **NEVER introduce async waterfalls**: Do not chain sequential `await` calls when requests can be executed concurrently via `Promise.all()`.
2. **NEVER import large full libraries when only a utility is needed**: Never `import _ from 'lodash'`; use `import debounce from 'lodash/debounce'` or native alternatives.
3. **NEVER render images or videos without explicit aspect ratios**: Always provide `width` and `height` or `aspect-ratio` to avoid Cumulative Layout Shift (CLS).
4. **NEVER trigger synchronous layout thrashing**: Do not alternate between reading layout properties (`offsetHeight`, `getBoundingClientRect`) and writing styles in loops.
5. **NEVER animate non-composited properties**: Animate only GPU-composited CSS properties (`transform`, `opacity`). Never animate `width`, `height`, `top`, `left`, or `margin`.

## Rules & Patterns

### 1. Vercel Optimization Hierarchy by Impact

| Priority | Category | Key Optimization Target | Expected Impact |
|:---|:---|:---|:---|
| **1. CRITICAL** | **Eliminating Waterfalls** | Parallel data fetching (`Promise.all`), Suspense streaming | **30–60% faster LCP** |
| **2. CRITICAL** | **Bundle Size Optimization** | Direct submodule imports, `next/dynamic`, deferring 3rd party scripts | **40–70% smaller initial JS** |
| **3. HIGH** | **Server-Side & RSC Caching** | `React.cache()` request deduplication, edge SSR caching | **Lower TTFB & DB load** |
| **4. MEDIUM-HIGH** | **Client Query Optimization** | SWR / TanStack Query stale-while-revalidate, deduplication | **Zero redundant network calls** |
| **5. MEDIUM** | **Render & DOM Optimization** | Virtualization for large lists, state colocation, `:focus-visible` | **Smooth 60 FPS / INP < 100ms** |

### 2. Eliminating Network Waterfalls

```ts
// [GOOD] Parallel execution
const [user, notifications] = await Promise.all([
  fetchUser(),
  fetchNotifications(),
]);
const posts = await fetchPosts(user.id);
```

### 3. Layout Shift & Visual Stability (CLS < 0.1)

- **Images & Video**: Always supply `width`, `height`, and `sizes` or CSS `aspect-ratio: 16 / 9`.
- **Dynamic Content**: Reserve layout space for dynamically loaded widgets with min-height placeholders or skeletons.
- **Tabular Numbers**: Use `font-feature-settings: "tnum"` / `font-variant-numeric: tabular-nums` for counters, clocks, and tables to prevent number width jitter.

## Code Examples

See `EXAMPLES.md` for detailed performance patterns and benchmark snippets.

## Validation Checklist

- [ ] LCP target is < 2.5s with preloaded critical fonts and LCP image `priority`.
- [ ] No sequential `await` waterfalls in API routes or Server Components.
- [ ] All animated elements use only `transform` and `opacity`.
- [ ] `prefers-reduced-motion` media queries are respected.
- [ ] Large tables / lists (> 100 items) utilize virtualization.

## Common Mistakes

- Chaining independent async requests instead of using `Promise.all`.
- Animating layout-triggering properties (`height`, `width`, `top`) causing jank.
- Missing image dimensions causing layout shift when images finish loading.

## Integration Notes

- Pairs with `nextjs` and `react` for App Router caching and component lifecycle tuning.
- Pairs with `ui-ux-pro` for smooth animations and responsive design tokens.
