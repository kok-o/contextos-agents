# impeccable-design Troubleshooting & Common Mistakes

## 1. Nested Border Radius Mismatch

- **Symptom**: Corners of an inner element poke out or look visually awkward inside a container.
- **Root Cause**: Using the same border-radius on both outer container and inner child.
- **Fix**: Inner radius formula: r_inner = max(0, r_outer - padding).

## 2. Animation Performance Stutter

- **Symptom**: Janky animations and dropped frames during transitions.
- **Root Cause**: Animating layout properties (width, height, top, margin).
- **Fix**: Animate only composited GPU-accelerated properties: transform and opacity.

## 3. Cluttered Visual Density

- **Symptom**: Interface feels overwhelming, cramped, and cheap.
- **Root Cause**: Cramming too many borders, dividers, badges, and icons into one view.
- **Fix**: Replace borders with generous whitespace; let alignment and typography hierarchy define grouping.
