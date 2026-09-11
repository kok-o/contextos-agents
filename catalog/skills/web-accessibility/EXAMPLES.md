# web-accessibility Examples — Anti-patterns vs ContextOS Standard

## Example 1: Semantic Buttons vs Clickable Divs

### Anti-pattern: Clickable Div

```tsx
// BAD: Cannot be focused with Tab, does not respond to Enter or Space, silent to screen readers
<div className="button" onClick={handleSubmit}>Submit</div>
```

### Best practice: ContextOS Standard (Semantic Button Element)

```tsx
// GOOD: Keyboard focusable, native Enter/Space handling, properly announced by assistive tech
<button type="button" onClick={handleSubmit} className="btn btn-primary">
  Submit
</button>
```

---

## Example 2: Icon-only Buttons

### Anti-pattern: Unlabelled Icon Button

```tsx
// BAD: Screen reader announces "button", user has zero idea what it does
<button onClick={onClose}><XIcon /></button>
```

### Best practice: ContextOS Standard (Accessible Label)

```tsx
// GOOD: Explicit aria-label and hidden decorative icon
<button type="button" onClick={onClose} aria-label="Close modal window">
  <XIcon aria-hidden="true" />
</button>
```
