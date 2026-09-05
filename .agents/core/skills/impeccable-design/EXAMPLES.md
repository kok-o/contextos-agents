# impeccable-design Examples — Anti-patterns vs ContextOS Standard

## Example 1: Dark Mode Surfaces & Elevation

### Anti-pattern: Pure Black with Flat Cards

```css
/* BAD: Pure #000000 background with harsh pure white borders and flat cards */
body { background-color: #000000; color: #ffffff; }
.card { background-color: #111111; border: 1px solid #ffffff; }
```

### Best practice: ContextOS Standard (Atmospheric Depth & Tinted Surfaces)

```css
/* GOOD: Tinted dark background with layered elevation surfaces and subtle border */
body {
  background-color: #0B0D13; /* Tinted with subtle deep blue */
  color: #E2E8F0;
}
.surface-1 {
  background-color: #111522;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}
```
