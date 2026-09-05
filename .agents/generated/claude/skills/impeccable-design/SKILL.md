# impeccable-design

## Overview

Hard QA design review checklist consisting of 50 deterministic rules covering typography (T1-T10), color systems (C1-C12), layout constraints (L1-L11), component contracts (K1-K11), and micro-animations (A1-A8).

## When to Use

Activate during the REVIEW phase of all frontend tasks as a strict visual and functional QA gate before marking UI work complete.

## Rules & Patterns

Based on [pbakaus/impeccable](https://github.com/pbakaus/impeccable) — deterministic detector rules for AI-generated frontend design.

## Core Principle

> Every model is trained on the same SaaS templates. Skip this guidance and you get the same handful of tells on every project. Impeccable eliminates them.

## Role in the Pipeline

> **This skill acts as a QA-designer at the `/review` phase.** `ui-ux-pro` is the planning guideline; `impeccable-design` is the hard checklist that runs before merge.

---

## Anti-Pattern Rules

### Typography (Rules T1–T10)

| Rule | Anti-Pattern | Correct Approach |
| ------ | ------------- | ----------------- |
| T1 | Using Inter for all text | Use Inter for UI body, pair with a distinct display font for headings OR with `JetBrains Mono` for technical/number accents (premium SaaS pattern) |
| T2 | Using Arial or Helvetica | Use a curated Google Font pairing |
| T3 | All text same weight | Use weight contrast: 700 headings, 400 body, 500 labels |
| T4 | Line height = 1 (tight) | Body: 1.6–1.8, Headings: 1.1–1.3 |
| T5 | No letter-spacing on caps | Uppercase labels: `letter-spacing: 0.08em` (Tailwind: `tracking-widest`) |
| T6 | Text too wide | Max line length: 60–75 characters — use `max-w-prose` or `max-w-[65ch]` |
| T7 | Monospace only for code | Use `tabular-nums` Tailwind class for number tables and data grids |
| T8 | Random font sizing | Use a consistent modular scale (1.25× or 1.333×) — use Tailwind's `text-*` scale |
| T9 | Body text too small | Minimum `text-sm` (14px) for body, never smaller than 12px |
| T10 | Bold everywhere | Bold is for emphasis. Diluted if overused. |

**Tailwind typography utilities:**

- `text-balance` — for headlines (prevents orphan words)
- `text-pretty` — for body paragraphs (smart line-breaks)
- `tabular-nums` — for numerical data tables

### Color (Rules C1–C12)

| Rule | Anti-Pattern | Correct Approach |
| ------ | ------------- | ----------------- |
| C1 | Pure black `#000` | Tint toward brand: `hsl(240, 10%, 4%)` |
| C2 | Pure white `#fff` for surfaces | Near-white with warmth: `hsl(40, 30%, 97%)` |
| C3 | Gray on colored background | Check contrast — likely fails WCAG. Use white/dark |
| C4 | Purple → Blue gradient | Clichéd AI palette. Use brand-derived gradients |
| C5 | Neon primary colors | Neon = accent only, never primary surface or text |
| C6 | Too many colors | 3 colors max: primary, neutral, semantic (success/error) |
| C7 | All links same blue `#0000EE` | Style links with brand color, preserve underline |
| C8 | Disabled state = gray only | Disabled: `opacity-40` + `cursor-not-allowed` |
| C9 | Success always green, Error always red | Check brand conflicts. Use accessible variants |
| C10 | Dark mode = inverted light mode | Dark mode needs separate palette — use `@layer base { .dark { ... } }` |
| C11 | No hover state change | Hover: shift lightness 8–12%, add `transition-colors duration-150` |
| C12 | Brand color on dark surface loses identity | Adjust saturation/lightness for dark bg context |

### Layout & Spacing (Rules L1–L11)

| Rule | Anti-Pattern | Correct Approach |
| ------ | ------------- | ----------------- |
| L1 | Cards inside cards | One level of card depth maximum |
| L2 | Icon tile above every heading | Use icons inline, in context, not decoratively above text |
| L3 | Centered long paragraphs | `text-center` max 2 lines only. Use `text-pretty` + left-align for body |
| L4 | Inconsistent spacing | Use Tailwind spacing utilities only. **Never arbitrary values** like `gap-[17px]` |
| L5 | Zero whitespace between sections | Sections need `py-16` to `py-24` breathing room |
| L6 | Content touching edges | Always `px-4` minimum on mobile |
| L7 | Same visual weight everywhere | Use hierarchy: primary > secondary > tertiary zones |
| L8 | Grid breaks on tablet | Test at 768px. Use 4-col on tablet, 12-col on desktop |
| L9 | Full-width everything | Max content width: `max-w-7xl` centered |
| L10 | Missing grid alignment | Use CSS Grid or Tailwind `grid` — not absolute positioning |
| L11 | Arbitrary high z-indexes | **NEVER** use `z-[999]` or `z-50` manually. Rely on DOM order + Radix/shadcn Portals which already handle modal elevation correctly |
| L12 | Default Rhythm | Break the 'Hero → 3 Features → CTA' structure. Build structurally diverse pages tailored to the content. |
| L13 | Symmetric card grids everywhere | Use asymmetric layouts (e.g., bento boxes, masonry, alternating left/right) to reduce the AI-generated feel. |

### Components (Rules K1–K11)

| Rule | Anti-Pattern | Correct Approach |
| ------ | ------------- | ----------------- |
| K1 | Two filled buttons side-by-side | `<Button variant="default">` + `<Button variant="outline">` or `variant="ghost"` |
| K2 | Button without loading state | Always add spinner + `disabled` during async actions |
| K3 | Modal without backdrop blur | shadcn `<Dialog>` handles this. Don't override with plain divs |
| K4 | Empty states left blank | **Always** design empty states: illustration + helpful message + primary CTA |
| K5 | No skeleton screens | Use `<Skeleton>` from shadcn for content areas, not just spinners |
| K6 | Tooltip on click (not hover) | Tooltips on hover, modals on click — use shadcn `<Tooltip>` + `<Dialog>` |
| K7 | Dropdown without keyboard nav | Use shadcn `<DropdownMenu>` — keyboard nav is built-in |
| K8 | Table without row hover | shadcn `<TableRow>` handles hover state automatically. Do **not** override it |
| K9 | Building complex UI from scratch | **Check shadcn/ui first**. If the component exists, generate the CLI command: `npx shadcn@latest add dialog`. Never manually rewrite what shadcn already provides |
| K10 | Native `<select>` or `<input type="date">` in premium UI | Native form controls cannot be styled consistently across Chrome/Safari/Firefox. Use `shadcn <Select>` and `shadcn <DatePicker>` for cross-browser consistency |
| K11 | Form without error state styling | Every input must have error state: red border + error message below |

### Animation (Rules A1–A8)

| Rule | Anti-Pattern | Correct Approach |
| ------ | ------------- | ----------------- |
| A1 | CSS bounce/elastic/spring easing | CSS spring animations are forbidden. **Exception**: If using Framer Motion, highly damped springs are encouraged: `{ type: "spring", stiffness: 400, damping: 30 }` for modals and popovers — this creates a premium, physical feel like Vercel/Linear |
| A2 | Animations that take > 400ms | Micro: 100–150ms, Components: 200–300ms, Pages: 300–400ms |
| A3 | Animations everywhere | Animate max 2–3 elements simultaneously |
| A4 | Same animation for enter and exit | Enter: ease-out (decelerate), Exit: ease-in (accelerate) |
| A5 | Animating expensive properties | Only animate `transform` and `opacity` — never `height`, `width`, `top` |
| A6 | No animation on mobile | Respect `prefers-reduced-motion: reduce` — wrap in `@media` or use `useReducedMotion()` |
| A7 | Scroll-triggered animations that block | Don't block content visibility for scroll reveals |
| A8 | Hover animations on touch devices | Wrap hover effects in `@media (hover: hover)` |

### Images & Icons (Rules I1–I8)

| Rule | Anti-Pattern | Correct Approach |
| ------ | ------------- | ----------------- |
| I1 | Decorative icons on every list item | Icons add meaning, not decoration. Use selectively. |
| I2 | Mix of icon styles | Pick one icon set (e.g., Lucide for shadcn). Stick with it. |
| I3 | Low-contrast icons | Icons need ≥ 3:1 contrast ratio |
| I4 | Images without aspect-ratio | Always set `aspect-video` or `aspect-square` to prevent layout shifts |
| I5 | No image loading state | Use `<Skeleton>` placeholder or blur hash |
| I6 | SVG icons inline without aria | Add `aria-hidden="true"` or `aria-label` |
| I7 | Stock photo generic humans | Use illustrations, abstract art, or genuine brand photography |
| I8 | Unoptimized images | WebP/AVIF, properly sized, `loading="lazy"` below fold |

---

## Design Initialization Checklist

Start every new design with:

```markdown
## Design Context

**Surface type**: [brand/marketing OR product/app]
**Target audience**: [who are they? what do they value?]
**Brand tone**: [professional/playful/bold/minimal/technical]
**Anti-references**: [designs this should NOT look like]
**Primary font**: [chosen font + why + Framer Motion / shadcn pairing]
**Color palette**: [3 semantic colors + HSL values for light AND dark]
**Component library**: [shadcn/ui | radix | custom]
**Animation library**: [CSS only | Framer Motion | GSAP]
```

---

## Design Review Audits

### Quick Audit (before PR)

- Typography: Is there clear visual hierarchy? Are fonts intentional? Is Inter paired properly?
- Color: Any pure black/white? Contrast failures? Too many colors? Dark mode?
- Spacing: Consistent Tailwind scale? No arbitrary values? Enough whitespace?
- Animation: Any CSS bounce/elastic? Too slow (>400ms)? Too many simultaneous?
- Components: Any native `<select>` or `<input type="date">` that should be shadcn?
- Z-index: Any hardcoded `z-[999]` or `z-50`?

### Full Audit (before release)

- Accessibility: Run axe DevTools or Lighthouse — target 90+ score
- Responsiveness: Test at 375px, 768px, 1280px, 1440px
- Dark mode: Does the full palette hold up? No inverted-only shortcuts?
- Empty states: Does every list/table have a designed empty state?
- Edge cases: Loading states, error states, long text overflow, RTL

---

## Premium Design Markers

These details separate premium from mediocre:

1. **Consistent border radius** — pick one and use it everywhere (`rounded-md` = 6px, `rounded-lg` = 8px)
2. **Intentional drop shadows** — darker near surface, lighter for floating elements
3. **Micro-copy quality** — button labels are verbs: "Save changes" not "Submit"
4. **Focus ring styling** — `focus-visible:ring-2 focus-visible:ring-primary` matching brand
5. **Smooth color transitions** — `transition-colors duration-150` on all interactive elements
6. **Optical alignment** — icon + text optically centered, not mathematically (`items-center gap-1.5`)


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


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