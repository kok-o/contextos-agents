# {{Project Name}} - UI/UX Specification

Draft scaffold: record the existing design system or an explicitly proposed
direction. Example dimensions below are optional starting values, not rules.

## Design System

### Colors

| Token | Value | Usage |
| --- | --- | --- |
| `--color-primary` | {{hex}} | Primary actions, links |
| `--color-secondary` | {{hex}} | Secondary elements |
| `--color-background` | {{hex}} | Page background |
| `--color-surface` | {{hex}} | Card/panel backgrounds |
| `--color-text` | {{hex}} | Body text |
| `--color-text-muted` | {{hex}} | Secondary text |
| `--color-error` | {{hex}} | Error states |
| `--color-success` | {{hex}} | Success states |

### Typography

| Level | Font | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| H1 | {{font}} | {{size}} | {{weight}} | {{lh}} |
| H2 | {{font}} | {{size}} | {{weight}} | {{lh}} |
| Body | {{font}} | {{size}} | {{weight}} | {{lh}} |
| Caption | {{font}} | {{size}} | {{weight}} | {{lh}} |

### Spacing Scale

`4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px`

### Border Radius

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-sm` | 4px | Inputs, small elements |
| `--radius-md` | 8px | Cards, panels |
| `--radius-lg` | 16px | Modals, hero sections |
| `--radius-full` | 9999px | Pills, avatars |

## Pages

### {{Page Name}}

- **Route:** `{{route}}`
- **Purpose:** {{what this page does}}
- **Components:** {{list of components}}
- **States:** default, loading, empty, error

## Component Library
<!-- List of reusable components -->

| Component | Props | Variants |
| --- | --- | --- |
| Button | `variant, size, disabled` | primary, secondary, ghost |
| Input | `type, label, error` | text, email, password |
| Card | `title, actions` | default, elevated |

## Responsive Breakpoints

| Name | Width | Layout |
| --- | --- | --- |
| Mobile | < 640px | Single column |
| Tablet | 640-1024px | Two columns |
| Desktop | > 1024px | Full layout |

## Usability and Accessibility Checks

- Measure text/control contrast on the actual background; do not ban colors.
- Verify keyboard focus, labels, errors, target sizes and content reflow.
- Use the product's typography; native and system fonts are valid choices.
- Give motion a purpose, support interruption and honor reduced motion.
- Check nested containers and hierarchy against actual content and tasks.
- Record tested states and unresolved issues; a filled template proves no test ran.
