# UI Design — Best Practices

## Design System Foundations

### Color

- **Never use generic colors** — curate a harmonious palette
- **Always tint** — no pure black (#000), no pure gray. Add a subtle warm or cool tint
- **Color roles**: primary (action), secondary (accent), neutral (text, borders), semantic (error, success, warning, info)
- **Dark mode**: design intentionally, not just invert. Surface hierarchy: background < surface < elevated
- **Contrast**: 4.5:1 minimum for body text, 3:1 for large text

### Typography

- **Never use browser defaults** — choose a curated font (Inter, Outfit, Geist, Sora)
- **Type scale**: use a modular scale (1.25 ratio) — 12, 14, 16, 20, 24, 32, 40, 48
- **Font weights**: Regular (400), Medium (500), Semibold (600), Bold (700). Don't use all of them — pick 2-3
- **Line height**: 1.5 for body, 1.2 for headings, 1.6 for long-form text
- **Max line width**: 65-75 characters for readability

### Spacing

- **Use a 4px grid** — all spacing should be multiples of 4
- **Spacing scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
- **Consistency** — same spacing between similar elements
- **Whitespace is design** — don't fill every pixel

### Layout

- **Grid system**: 12-column grid for desktop, 4-column for mobile
- **Visual hierarchy**: size, weight, color, spacing, position
- **F-pattern/Z-pattern** — for content-heavy pages
- **Group related items** — use proximity and boundaries

## Component Patterns

### Buttons

- Clear hierarchy: Primary > Secondary > Ghost/Text
- Consistent sizing: sm (32px), md (40px), lg (48px)
- States: default, hover, active, disabled, loading
- Always accessible: sufficient contrast, focus indicator

### Forms

- Labels above inputs (not floating labels for critical forms)
- Clear error states with inline messages
- Logical tab order
- Progressive disclosure — don't show all fields at once

### Cards

- Don't nest cards inside cards
- Clear visual hierarchy within the card
- Consistent padding and spacing
- Interactive cards need hover state

### Navigation

- Maximum 7±2 items in primary nav
- Clear active state
- Mobile: bottom nav or hamburger (not both)
- Breadcrumbs for deep hierarchies

## Animation Principles

- **Purpose**: guide attention, show relationships, provide feedback
- **Duration**: 150-300ms for micro-interactions, 300-500ms for transitions
- **Easing**: `ease-out` for entrances, `ease-in` for exits. Never `bounce` or `elastic`
- **Reduce motion**: respect `prefers-reduced-motion`

## Anti-Patterns (from Impeccable)

- [FAIL] Gray text on colored backgrounds — destroys readability
- [FAIL] Pure black text on white (#000 on #fff) — too harsh, tint the black
- [FAIL] Cards nested inside cards — visual noise
- [FAIL] Bounce/elastic easing — feels dated
- [FAIL] Icon tile above every heading — SaaS template tell
- [FAIL] Purple-to-blue gradient on everything — overused
- [FAIL] Using Inter for everything — pick a font that matches your brand
- [FAIL] Rounded-square icons everywhere — lack of visual variety

## Dark Mode

- Surface elevation through subtle lightening (not colored backgrounds)
- Reduce white contrast — use #E0E0E0, not #FFFFFF
- Shadows become less visible — use subtle borders or elevation changes
- Test all states in both modes
