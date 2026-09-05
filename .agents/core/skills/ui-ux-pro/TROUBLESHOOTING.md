# ui-ux-pro Troubleshooting & Common Mistakes

## 1. Obvious AI Design Tells

- **Symptom**: The interface immediately looks like a generic AI prototype.
- **Root Cause**: Using Inter alone, pure black (#000000), purple-blue gradients, and rounded icon squares above every title.
- **Fix**: Use tinted backgrounds (#090A0F), pair primary font with JetBrains Mono for code/numbers, use subtle border highlights.

## 2. Contrast Failures in Secondary Elements

- **Symptom**: Captions, timestamps, and borders are invisible or impossible to read.
- **Root Cause**: Using flat #666 or #444 grays without testing against actual background luminance.
- **Fix**: Always test contrast ratios (minimum 4.5:1 for body, 3:1 for graphical boundaries) using semantic theme tokens.

## 3. Nesting Cards Inside Cards

- **Symptom**: Visual claustrophobia and slop aesthetic.
- **Root Cause**: Putting bordered cards inside other bordered cards.
- **Fix**: Flatten the hierarchy. Use background surface contrast and negative space instead of border-in-border nesting.
