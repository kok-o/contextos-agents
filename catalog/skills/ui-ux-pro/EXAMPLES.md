# UI/UX Pro Examples — Anti-patterns vs ContextOS Standard

## Example 1: Accessible Icon Button with Visible Focus States

### Anti-pattern: Anti-pattern (Missing accessible name and arbitrary color values)

```tsx
// BAD: inaccessible to screen readers, missing focus ring, arbitrary hex
<button className="bg-[#5a4fcf] p-[7px] rounded-[5px]" onClick={onClose}>
  <XIcon />
</button>
```

### Best practice: ContextOS Standard (Semantic token scales & ARIA label)

```tsx
// GOOD: full keyboard accessibility, semantic tokens, focus-visible ring
<button
  type="button"
  aria-label="Close modal dialog"
  onClick={onClose}
  className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
>
  <X className="h-4 w-4" aria-hidden="true" />
</button>
```

---

## Example 2: Stat Card Hierarchy

### Anti-pattern: Anti-pattern (Flat low-contrast layout with purple-gradient cliche)

```tsx
// BAD: cliche AI gradient, poor typographic hierarchy
<div className="bg-gradient-to-r from-purple-500 to-blue-500 p-4 rounded-xl text-white">
  <div>Total Revenue</div>
  <div className="text-xl">$45,231.89</div>
</div>
```

### Best practice: ContextOS Standard (Refined editorial typography & subtle depth)

```tsx
// GOOD: high contrast, monospace numerical accent, subtle border
<div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm transition-all hover:shadow-md">
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      Total Revenue
    </span>
    <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
  </div>
  <div className="mt-3 flex items-baseline gap-2">
    <span className="font-mono text-3xl font-semibold tracking-tight text-foreground">
      $45,231.89
    </span>
    <span className="font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">
      +14.2%
    </span>
  </div>
</div>
```
