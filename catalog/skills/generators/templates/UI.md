# {{Project Name}} — UI/UX Specification

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

## Anti-Patterns (avoid these)

- No gray text on colored backgrounds
- No pure black — always tint with brand color
- No bounce/elastic easing — use ease-out
- No cards nested inside cards
- No generic color palettes (plain red, blue, green)
- No default browser fonts — use curated typography
