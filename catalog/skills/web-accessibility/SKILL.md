---
name: web-accessibility
description: Implement and review concrete web accessibility behavior, including
  semantics, names, keyboard focus, forms and motion preferences.
---

# web-accessibility

## Overview

Implement and review concrete web accessibility behavior, including semantics, names, keyboard focus, forms and motion preferences. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

An accessibility requirement or interaction barrier affects the task. This skill provides implementation detail; web-design-guidelines covers broader interface review.

## Rules & Patterns

Use native semantics and established components where they meet the need. Accessible names, visible labels, error associations and meaningful structure matter independently of visual styling.

Check keyboard navigation and visible focus through the real flow. A modal and a nonmodal popover have different focus behavior; adding role or aria-modal does not create trapping, dismissal or focus restoration by itself.

Use unique control IDs when an input component can repeat, preserve useful caller-provided descriptions and avoid overriding required relationships accidentally. Explain errors and state changes without relying only on color.

Respect reduced-motion preferences and provide appropriate controls for persistent distracting content. Preserve zoom/reflow and alternatives to gesture-only or hover-only actions.

Use current accessibility standards for the intended conformance target. Code examples and automated checks cover a limited surface; verify relevant browsers and assistive-technology interactions before claiming conformance.

## Code Examples

The dialog, focus CSS and form blocks below are partial implementation patterns. The local fixture simulates selected transitions and parses syntax; it does not certify real keyboard focus or assistive-technology behavior.

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

```tsx
import React, { useEffect, useRef } from 'react';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
}

/**
 * Illustrative controlled modal pattern; browser and assistive-technology checks remain necessary
 * Uses native HTMLDialogElement with .showModal(); verify in the target environment:
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

```tsx
import { useId, type InputHTMLAttributes } from 'react';

type EmailInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  error?: string;
  label?: string;
};

export function EmailInput({ error, label = 'Email address', ...props }: EmailInputProps) {
  const generatedId = useId();
  const { id, 'aria-describedby': description, ...inputProps } = props;
  const inputId = id || generatedId;
  const errorId = inputId + '-error';
  const describedBy = [description, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input {...inputProps} id={inputId} type="email" aria-invalid={error ? true : inputProps['aria-invalid']} aria-describedby={describedBy} />
      {error && <p id={errorId} role="alert">{error}</p>}
    </div>
  );
}
```

## Validation Checklist

- [ ] Check names, labels, focus order/restoration, relevant contrast and reflow.
- [ ] Separate static checks, simulated transitions, real-browser and assistive-technology evidence.

## Common Mistakes

Declaring universal WCAG compliance; trapping focus in nonmodal content; repeated static IDs; assuming ARIA adds interaction behavior.

## Integration Notes

Optional companion guidance: web-design-guidelines, webapp-testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
