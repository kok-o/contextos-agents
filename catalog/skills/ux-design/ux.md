# UX Design — Best Practices

## Information Architecture

- **Mental models** — organize content the way users think, not the way your code is structured
- **Card sorting** — group features into logical categories
- **Navigation structure** — no more than 3 clicks to any page
- **Naming** — use user's language, not internal jargon

## User Flows

### Design every state

Every screen has 5 states. Design ALL of them:

1. **Empty state** — first visit, no data yet. Include CTA to get started
2. **Loading state** — skeleton screens > spinners
3. **Partial state** — some data, not complete
4. **Ideal state** — normal usage with data
5. **Error state** — what went wrong and how to fix it

### Reduce cognitive load

- **Progressive disclosure** — show only what's needed now
- **Sensible defaults** — pre-fill what you can
- **Inline help** — tooltips and contextual guidance
- **Confirmation for destructive actions** — but NOT for every action

## Forms UX

- Show progress for multi-step forms
- Validate inline (on blur), not on submit
- Show password requirements as the user types
- Auto-focus the first input
- Use appropriate input types (email, tel, date)
- Disable submit button only when form is submitting, never as "validation"

## Onboarding

- **Quick win** — let users see value within 30 seconds
- **Minimal signup** — only ask for what's absolutely needed
- **Progressive onboarding** — teach features as users encounter them
- **Skip option** — always let users skip tutorials

## Feedback

- Every action needs feedback (success, error, pending)
- Use toast notifications for non-blocking feedback
- Use inline messages for form validation
- Loading states should be < 300ms before showing (avoid flash)
- Optimistic UI for fast-perceived actions

## Mobile UX

- Touch targets: minimum 44x44px
- Thumb zones — place primary actions within easy reach
- Bottom navigation for core actions
- Pull-to-refresh for content lists
- Haptic feedback for important actions

## Psychology Principles

- **Fitts's Law** — make important targets large and close
- **Hick's Law** — reduce choices to reduce decision time
- **Jakob's Law** — users prefer familiar patterns
- **Peak-End Rule** — make the last interaction great
- **Aesthetic-Usability Effect** — beautiful things are perceived as easier to use

## Usability Heuristics (Nielsen)

1. Visibility of system status
2. Match between system and real world
3. User control and freedom (undo, escape)
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency of use
8. Aesthetic and minimalist design
9. Help users recognize and recover from errors
10. Help and documentation
