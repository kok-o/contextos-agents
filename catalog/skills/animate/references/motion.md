# Motion implementation checks

## Choose a mechanism

Use a transition when a class or attribute controls visual state. Use WAAPI
when playback, cancellation or a programmatic timeline is useful. Use an
installed library when it handles real gesture/layout/exit requirements better.
Check the installed API and browser support before using newer features.

## Interruption and exit

Test open-close-open before the first transition ends. Preserve the current
visual value or velocity where the mechanism supports it. Cancel stale completion
callbacks so they cannot hide a reopened element. Clean up on unmount.
Prefer the component library's presence/focus contract for overlays. Semantic
closure should take effect immediately even when a decorative exit remains.

## Accessibility

Under prefers-reduced-motion, remove large translations, parallax, unnecessary
loops and other nonessential movement. Instant changes are valid. If an opacity
transition remains, ensure it still helps and is not distracting. Persistent
animation may need a visible pause/stop control. Check focus independently of
the visual effect and preserve ordinary touch and keyboard interactions.

## Performance

Transform and opacity are useful defaults, not guarantees of compositing.
Large layers, filters, rasterization, layout, React work and other scripts can
still cause dropped frames. Record a trace before claiming an improvement.
See [reduced motion documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
