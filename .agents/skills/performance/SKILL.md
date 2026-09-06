---
name: Web Performance
description: >
  ContextOS skill for Web Performance
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


<!-- Source: performance.md -->

# Web Performance — Best Practices

## Core Web Vitals

| Metric | Target | What it measures |
| --- | --- | --- |
| LCP (Largest Contentful Paint) | < 2.5s | Loading performance |
| INP (Interaction to Next Paint) | < 200ms | Responsiveness |
| CLS (Cumulative Layout Shift) | < 0.1 | Visual stability |

## Loading Performance

- **Code splitting** — split by route, lazy load non-critical components
- **Tree shaking** — use ES modules, avoid side-effect imports
- **Image optimization** — WebP/AVIF, responsive srcset, lazy loading
- **Font loading** — `font-display: swap`, preload critical fonts
- **Critical CSS** — inline above-the-fold styles
- **Preconnect** — `<link rel="preconnect">` for third-party origins

## Runtime Performance

- **Avoid layout thrashing** — batch DOM reads and writes
- **Debounce/throttle** — expensive event handlers (scroll, resize, input)
- **Web Workers** — offload heavy computation
- **Virtualize long lists** — render only visible items
- **Avoid synchronous operations** — use async/await, requestIdleCallback

## Bundle Optimization

- **Analyze bundle** — use webpack-bundle-analyzer or similar
- **Dynamic imports** — `import()` for heavy libraries
- **Avoid barrel exports** — they prevent tree shaking
- **Vendor splitting** — separate vendor chunks for caching
- **Compression** — Brotli > gzip

## Caching Strategy

| Asset | Cache | Strategy |
| --- | --- | --- |
| HTML | Short (5min) | Revalidate |
| JS/CSS (hashed) | Long (1 year) | Immutable |
| Images | Long (1 year) | Immutable |
| API responses | Depends | stale-while-revalidate |
| Fonts | Long (1 year) | Immutable |

## Anti-Patterns

- [FAIL] Importing entire libraries (`import _ from 'lodash'`)
- [FAIL] Unoptimized images (PNG > 500KB)
- [FAIL] Blocking scripts in `<head>` without `defer`
- [FAIL] Layout shifts from dynamic content (no dimensions on images)
- [FAIL] Premature optimization — measure first, optimize second

<!-- Source: EXAMPLES.md -->

# performance Examples — Anti-patterns vs ContextOS Standard

## Example 1: Dynamic Imports for Heavy Libraries

### Anti-pattern: Static Import of Heavy Visualizers in Initial Bundle

```typescript
// BAD: Adds 800KB (Monaco editor or Three.js) to the critical first-paint bundle!
import { CodeEditor } from '@/components/CodeEditor';

export default function Page() {
  return <div><CodeEditor /></div>;
}
```

### Best practice: ContextOS Standard (Lazy Load on Demand)

```typescript
// GOOD: Dynamic import splits chunk, only downloads when component renders
import dynamic from 'next/dynamic';

const CodeEditor = dynamic(
  () => import('@/components/CodeEditor'),
  { loading: () => <EditorSkeleton />, ssr: false }
);

export default function Page() {
  return <div><CodeEditor /></div>;
}
```

<!-- Source: TROUBLESHOOTING.md -->

# performance Troubleshooting & Common Mistakes

## 1. Cumulative Layout Shift (CLS) from Images & Fonts

- **Symptom**: Page content jumps around as images and custom fonts load.
- **Root Cause**: Missing width and height attributes on image tags and FOUT (Flash of Unstyled Text).
- **Fix**: Always specify aspect-ratio or width/height on images, and use next/font to preload web fonts with fallback sizing.

## 2. High Interaction to Next Paint (INP)

- **Symptom**: User clicks a button and the UI freezes for 200ms+ before responding.
- **Root Cause**: Long task blocking the main thread during event dispatch.
- **Fix**: Defer non-critical state updates using startTransition() or split heavy computation with Web Workers.

## 3. Unoptimized SVG / Icon Overload

- **Symptom**: Huge DOM node count and slow initial render times.
- **Root Cause**: Rendering 500 inline SVG icons with complex paths.
- **Fix**: Use SVG sprite sheets, dynamic icon loaders, or lightweight canvas rendering for dense data visualizations.
