---
name: Web Accessibility
description: >
  ContextOS skill for Web Accessibility (WCAG 2.1 AA/AAA), ARIA dialog patterns, keyboard focus traps, and Web Interface Guidelines.
---

# Web Accessibility & Interface Guidelines

## Overview

Enforces universal accessibility compliance (WCAG 2.1 AA / AAA), rigorous semantic markup, keyboard navigability with focus traps, screen reader live regions, and Web Interface Guidelines standards.

## When to Use

Activate whenever building, styling, or reviewing user interfaces, forms, modals, menus, navigation drawers, custom interactive widgets, or media elements.

## Negative Constraints (What NOT to Do)

1. **NEVER use `outline: none` without a custom `:focus-visible` replacement**: Keyboard users must always have a distinct, high-contrast visual focus ring.
2. **NEVER use non-semantic elements (`<div onClick>`) for interactive triggers**: Always use native `<button>` or `<a href>`.
3. **NEVER create modals or dialogs without keyboard focus traps**: Focus must remain trapped inside open dialogs during Tab / Shift-Tab navigation and restore to trigger on close.
4. **NEVER rely exclusively on color to indicate state or errors**: Always pair colors with text labels, icons, or ARIA attributes (`aria-invalid="true"`).
5. **NEVER trap screen readers with missing form labels or error associations**: Every input must link to `<label htmlFor="id">` and errors via `aria-describedby`.
6. **NEVER play animations without honoring `prefers-reduced-motion`**: Respect user OS motion reduction preferences.

## Rules & Patterns

### 1. Focus Visible & High-Contrast Focus Rings

```css
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}

button:focus:not(:focus-visible) {
  outline: none;
}
```

### 2. Accessible Modal & Focus Trap Contract

```tsx
import React, { useEffect, useRef } from 'react';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}

/**
 * Accessible Modal Dialog (W3C ARIA APG Compliant)
 * Uses native HTMLDialogElement with .showModal() to guarantee:
 * 1. Native inert background (blocks screen reader and click bleed-through).
 * 2. Native keyboard focus trap (strictly keeps Tab cycles within dialog).
 * 3. Native Escape key cancellation and focus restoration to trigger element.
 */
export function AccessibleModal({ isOpen, onClose, titleId, children }: AccessibleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl border backdrop:bg-black/60 outline-none"
    >
      {children}
    </dialog>
  );
}
```

### 3. Accessible Forms & Error Association

```tsx
export function EmailInput({ error, ...props }: { error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const inputId = 'user-email';
  const errorId = 'user-email-error';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        Email Address <span aria-hidden="true" className="text-destructive">*</span>
      </label>
      <input
        id={inputId}
        type="email"
        autoComplete="email"
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="rounded-md border p-2 text-sm focus-visible:ring-2"
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

## Code Examples

See `EXAMPLES.md` for detailed dialog, menu, and form examples.

## Validation Checklist

- [ ] All interactive elements are fully operable via Keyboard (`Tab`, `Enter`, `Space`, `Escape`).
- [ ] Visual `:focus-visible` styling is distinct and high contrast (≥ 3:1).
- [ ] Modals use `role="dialog"`, `aria-modal="true"`, focus trap, and restore focus on close.
- [ ] Text contrast ratios satisfy WCAG AA (≥ 4.5:1 for normal text, ≥ 3:1 for large text).
- [ ] Forms pair inputs with `<label htmlFor>`, valid `autocomplete` tokens, and `aria-invalid`.
- [ ] Non-text media contains descriptive `alt` attributes or `aria-hidden="true"` for decorative icons.

## Common Mistakes

- Hiding outline focus indicators globally without `:focus-visible` fallback.
- Forgetting to trap focus in modal dialogs or not returning focus to trigger when modal closes.
- Missing `aria-expanded` attributes on disclosure buttons and dropdown toggles.

## Integration Notes

- Pairs with `ui-ux-pro` and `impeccable-design` for visual contrast and component standards.
- Pairs with `react` and `nextjs` for accessible dialogs and focus restoration across route transitions.
