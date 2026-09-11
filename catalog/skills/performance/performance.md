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
