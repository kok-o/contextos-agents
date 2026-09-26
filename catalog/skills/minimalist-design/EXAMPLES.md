# Minimalist Design - Component & Layout Examples

## Example 1: Editorial Bento Grid Component

```tsx
import React from 'react';

interface MetricItem {
  label: string;
  value: string;
  change: string;
}

export function MinimalistBentoGrid({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 rounded-sm overflow-hidden">
      {metrics.map((item) => (
        <div key={item.label} className="bg-white p-8 flex flex-col justify-between hover:bg-neutral-50 transition-colors">
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-mono">
            {item.label}
          </span>
          <div className="mt-8">
            <div className="text-3xl font-light tracking-tight text-neutral-900 font-sans">
              {item.value}
            </div>
            <div className="mt-2 text-xs text-neutral-500 font-mono">
              {item.change} vs baseline
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Example 2: Clean Monochrome Navigation

```tsx
export function MinimalistNav() {
  return (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <a href="/" className="font-medium text-sm tracking-tight text-neutral-900 hover:text-neutral-600 transition-colors">
          ContextOS
        </a>
        <nav className="flex items-center gap-6 text-xs tracking-wide text-neutral-500 font-mono">
          <a href="/docs" className="hover:text-neutral-900 transition-colors">Docs</a>
          <a href="/specs" className="hover:text-neutral-900 transition-colors">Specs</a>
          <a href="/status" className="hover:text-neutral-900 transition-colors">Status</a>
        </nav>
      </div>
    </header>
  );
}
```
