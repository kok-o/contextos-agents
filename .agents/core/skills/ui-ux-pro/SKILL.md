---
name: ui-ux-pro
description: >
  Professional UI/UX design skill. Enforces accessibility, semantic color palettes,
  proper spacing, and bans all common AI design anti-patterns and clichés.
  Adapted for Tailwind CSS v4, shadcn/ui, and Framer Motion stacks.
---

# ui-ux-pro

## Overview

A brief summary of what the skill does and its core philosophy.

## When to Use

Context for when this skill is applicable.

## Rules & Patterns

Inspired by [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

## Core Principle

> Great design is invisible. Bad design is obvious. You will never produce obvious AI design.

## Pre-flight Check & Brief Inference

Before starting a design implementation:
1. Infer the unwritten constraints of the domain (e.g., if it's a dev tool, assume dark mode, monospaced numbers, dense layout).
2. Propose a "Design Brief Inference" summarizing the intended aesthetic.

---

## [FAIL] Absolute Prohibitions (Never Do These)

### Typography Anti-Patterns

- **NEVER** use Arial, Helvetica, or system-ui defaults as primary fonts
- **NEVER** use Inter as the ONLY font — it is the #1 "AI-generated" visual tell when used alone
  - [PASS] **CORRECT**: If using Inter for primary UI text, ALWAYS pair it with a strong monospace font like `JetBrains Mono` for numbers, code blocks, and technical accents to create a premium SaaS aesthetic (see Vercel, Linear)
  - [FAIL] **WRONG**: Inter for headings, body, labels, numbers, captions — everything
- **NEVER** mix more than 2 font families
- **ALWAYS** import proper fonts from Google Fonts or similar

### Color Anti-Patterns

- **NEVER** use pure black `#000000` — always tint toward brand hue (e.g. `#0A0A0F`)
- **NEVER** use pure gray `#808080` — tint it (e.g. `#6B7280` has blue undertones)
- **NEVER** use purple-to-blue gradients — it is the #1 "AI generated" visual tell
- **NEVER** use neon colors for primary UI (only accents, sparingly)
- **ALWAYS** use HSL-based semantic palettes with clear naming

### Layout Anti-Patterns

- **NEVER** nest cards inside cards (card-in-card = instant slop flag)
- **NEVER** put a rounded-square icon tile above every heading
- **NEVER** center-align long paragraphs (> 2 lines)
- **NEVER** use gray text on colored backgrounds (contrast failure)

### Animation Anti-Patterns

- **NEVER** use bounce or elastic easing in raw CSS — it feels dated (circa 2014)
- **NEVER** add animations just to show they work
- **ALWAYS** use `ease-out` for enter, `ease-in` for exit, `ease-in-out` for continuous

---

## [PASS] Required Standards

### Accessibility Checklist

Before shipping any UI, verify:

- [ ] Text contrast ratio ≥ 4.5:1 for normal text (WCAG AA)
- [ ] Text contrast ratio ≥ 3:1 for large text (≥ 18px bold or ≥ 24px)
- [ ] All interactive elements have `aria-label` or visible text
- [ ] Touch targets are minimum 44×44px (48×48px recommended)
- [ ] Focus states are visible and styled (not just browser default)
- [ ] Images have meaningful `alt` text (or `alt=""` if decorative)
- [ ] Form fields have associated `<label>` elements
- [ ] Keyboard navigation works without mouse
- [ ] No color alone conveys information (use icons + text too)

### Semantic Color Palette — shadcn/ui & Tailwind CSS v4 Format

Generate palettes in the format compatible with shadcn/ui's `globals.css`. Always support both light and dark themes as this is the de-facto standard:

```css
@layer base {
  :root {
    --background: 220 13% 98%;
    --foreground: 220 13% 9%;
    --card: 220 13% 100%;
    --card-foreground: 220 13% 9%;
    --muted: 220 13% 95%;
    --muted-foreground: 220 9% 46%;
    --border: 220 13% 90%;
    --input: 220 13% 90%;
    --primary: 258 90% 56%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 13% 94%;
    --secondary-foreground: 220 13% 9%;
    --accent: 258 90% 56%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --ring: 258 90% 56%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 220 13% 9%;
    --foreground: 210 40% 98%;
    --card: 220 11% 13%;
    --card-foreground: 210 40% 98%;
    --muted: 220 11% 16%;
    --muted-foreground: 215 16% 65%;
    --border: 217 19% 22%;
    --input: 217 19% 22%;
    --primary: 258 90% 66%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 11% 18%;
    --secondary-foreground: 210 40% 98%;
    --accent: 258 90% 66%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --ring: 258 90% 66%;
  }
}
```

> **Rule**: NEVER define colors as raw hex/rgb. ALWAYS use HSL space values so Tailwind opacity modifiers (`text-primary/80`) work correctly.

### Spacing System (Tailwind)

Use Tailwind spacing utilities. **Never use arbitrary values** like `gap-[17px]`:

- `gap-1` / `p-1` — 4px micro gaps
- `gap-2` / `p-2` — 8px component internal
- `gap-4` / `p-4` — 16px standard padding
- `gap-6` / `p-6` — 24px section gaps
- `gap-8` / `p-8` — 32px block separators
- `gap-12` / `py-12` — 48px section separators
- `gap-20` / `py-20` — 80px hero spacing

### Typography Scale

Use a modular type scale (1.25 or 1.333 ratio):

```
xs:  11px / 0.688rem  (text-xs)
sm:  13px / 0.813rem  (text-sm)
base: 16px / 1rem     (text-base)
lg:  20px / 1.25rem   (text-lg)
xl:  24px / 1.5rem    (text-xl)
2xl: 32px / 2rem      (text-2xl)
3xl: 40px / 2.5rem    (text-3xl)
4xl: 56px / 3.5rem    (text-4xl)
```

Typography utilities:

- Long headlines: use `text-balance` (prevents orphan words)
- Body paragraphs: use `text-pretty` (smart line breaks)
- Number tables: use `tabular-nums` class (not custom CSS)

---

## Design Parameters (Taste Equalizers)

Always set and document the following three parameters (1-10 scale) before starting any design task, to escape generic AI defaults:

- **DESIGN_VARIANCE (1-10)**: Grid and Layout structures. 
  - 1-3 = Clean, centered layouts, standard grids (Enterprise, Docs).
  - 4-7 = Asymmetric containers, off-grid elements, sticky sidebars (SaaS, Creative tools).
  - 8-10 = Broken grids, overlapping items, editorial style (Portfolios, Agencies).
- **MOTION_INTENSITY (1-10)**: Animation depth.
  - 1-3 = Basic hover states and micro-interactions only.
  - 4-7 = Page transitions, enter/exit animations, list staggers.
  - 8-10 = Magnetic elements, complex scroll-triggered animations (GSAP territory).
- **VISUAL_DENSITY (1-10)**: Information architecture.
  - 1-3 = Luxury, airy, massive whitespace (Landing pages).
  - 4-7 = Standard product density (Consumer apps).
  - 8-10 = Dense, compact, dashboard-style (Pro tools, IDEs, Trading platforms).

## Adaptive Aesthetics (Project Mapping)

Select the base aesthetic based on the project domain:
- **Fintech / Enterprise**: Swiss Minimalism, Neumorphism (High trust, clean, DESIGN_VARIANCE: 2-4).
- **AI Tools / DevTools**: Dark OLED Luxury, Glassmorphism (Modern, tech-forward, DESIGN_VARIANCE: 5-7).
- **Creative / Portfolios**: Brutalism, Maximalist, Aurora (Bold, expressive, DESIGN_VARIANCE: 8-10).

## Design Memory & Consistency

**CRITICAL**: You must preserve design decisions between sessions to avoid stylistic drift.
Whenever you establish core UI tokens (fonts, color scales, border radii, equalizers), write them to `.interface-design/system.md`. In subsequent sessions, ALWAYS read this file before generating new components.

---

## Design Domains

### Product UI (SaaS / Dashboard / App)

- Functional over decorative
- Dense information where needed (use compact variants)
- Table zebra striping: use `5%` opacity, not hard borders
- Data visualization: prefer Chart.js or Recharts, label all axes
- Loading states: skeleton screens, never spinners alone
- **Empty States**: ALWAYS design the empty state for every list/table/feed. Never leave a blank screen. Include:
  1. An illustration or meaningful icon
  2. A helpful, context-aware message ("No results yet" not "No data")
  3. A clear primary action CTA ("Create your first project →")

### Marketing / Landing Pages

- Hero: full viewport height, one clear CTA
- Social proof above the fold when possible
- CTA buttons: filled primary + ghost secondary (never two filled)
- Testimonials: real photos, full name, company

### Forms

- Label above field (not placeholder-as-label)
- Inline validation (show errors on blur, not on submit)
- Group related fields visually
- Progress indicator for multi-step flows

---

## Image-First Pipeline (Design Sprints)

If you have access to image generation tools (e.g., DALL-E, Midjourney integrations) and the task involves creating a net-new UI page or component, follow the **Image-First Pipeline**:
1. **Generate**: Create 1-3 reference images ("mockups", "brand boards") of the desired UI using image generation.
2. **Analyze**: Review the generated images for layout, spacing, and typography choices.
3. **Implement**: Write the code to match the aesthetic of the generated reference images.
*Do not skip straight to code for major UI overhauls without a visual reference if generation is available.*

---

## UI Style Toolkit

### Glassmorphism (Use Sparingly)

```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.1);
```

### Subtle Shadows (Dark UI)

```css
/* Card elevation */
box-shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6);
/* Floating element */
box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
```

### Micro-animations

**CSS (for simple, lightweight elements):**

```css
/* Standard transition */
transition: all 0.15s ease-out;
/* Hover lift */
transform: translateY(-2px);
/* Button press */
transform: scale(0.97);
/* Fade in */
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } }
```

**Framer Motion (for complex layout transitions and orchestration):**

For complex UI like modals, popovers, layout shifts, and multi-element orchestration, prefer Framer Motion over raw CSS keyframes. Keep animations quick and purposeful:

```tsx
// [GOOD] Modal entrance — use highly damped spring for physical feel (like Vercel/Linear)
<motion.div
  initial={{ opacity: 0, scale: 0.96, y: 8 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.96, y: 8 }}
  transition={{ type: "spring", stiffness: 400, damping: 30 }}
/>

// [GOOD] List item stagger
<motion.li
  initial={{ opacity: 0, x: -8 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
/>

// [BAD] Never use low damping (bouncy feel)
transition={{ type: "spring", stiffness: 200, damping: 8 }} // WRONG
```

**Rule**: `duration` must always be `< 0.3s` for micro-interactions. Respect `prefers-reduced-motion`.

---

## Domain Search Guide

When choosing styles, reference these domains:

- `style` — UI style options (glassmorphism, neobrutalism, minimalism)
- `typography` — Font pairing recommendations  
- `color` — Color palettes by product type
- `ux` — Best practices and anti-patterns
- `gsap` — Animation patterns by intensity (hover, scroll, transition)

## Role Integration

This skill is used at two stages in the pipeline:

- **Planning stage** (`/plan`): Use as a design guideline when speccing UI components
- **Review stage** (`/review`): Use as a strict QA checklist — audit every rule before shipping


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.
