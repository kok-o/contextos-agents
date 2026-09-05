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
