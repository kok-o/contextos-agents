# web-accessibility Troubleshooting & Common Mistakes

## 1. Trapping Keyboard Users in Inactive Elements

- **Symptom**: Tab key moves focus into invisible elements hidden offscreen.
- **Root Cause**: Using display: none vs opacity: 0 or left: -9999px.
- **Fix**: Always apply display: none / hidden or inert attribute to elements that are currently not visible.

## 2. Color Contrast Violations

- **Symptom**: Text is unreadable for users with low vision or in bright sunlight.
- **Root Cause**: Contrast ratio between text and background color is below WCAG AA thresholds.
- **Fix**: Ensure contrast ratio is at least 4.5:1 for body text and 3:1 for large text / graphical controls.

## 3. Silent Dynamic Updates

- **Symptom**: Asynchronous error messages or notifications appear on screen without screen reader announcement.
- **Root Cause**: Missing ARIA live region.
- **Fix**: Wrap notification banners in aria-live="polite" and role="status".
