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
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}

export function AccessibleModal({ isOpen, onClose, titleId, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    triggerRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }

      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) || [];
        if (!focusables.length) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl border"
      >
        {children}
      </div>
    </div>,
    document.body
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
