# Soft Design - Component & Layout Examples

## Example 1: Glassmorphic Elevated Panel

```tsx
import React from 'react';

interface SoftPanelProps {
  title: string;
  category: string;
  children: React.ReactNode;
}

export function SoftElevatedPanel({ title, category, children }: SoftPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/60 p-8 shadow-[0_20px_50px_rgba(8,_112,_184,_0.07)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_30px_60px_rgba(8,_112,_184,_0.12)]">
      {/* Subtle ambient light gradient */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-200/50 to-pink-200/30 blur-2xl" />

      <div className="relative z-10">
        <span className="inline-block rounded-full bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-600 backdrop-blur-sm">
          {category}
        </span>
        <h2 className="mt-4 text-2xl font-normal tracking-tight text-slate-800">
          {title}
        </h2>
        <div className="mt-6 text-slate-600 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
```

---

## Example 2: Soft Tactile Pill Button

```tsx
export function SoftPillButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-gradient-to-b from-indigo-500 to-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-[0_10px_20px_-5px_rgba(79,_70,_229,_0.3)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_15px_25px_-5px_rgba(79,_70,_229,_0.4)] active:scale-[0.98]"
    >
      {label}
    </button>
  );
}
```
