# Brutalist Design - Component & Layout Examples

## Example 1: High-Contrast Neobrutalist Action Card

```tsx
import React from 'react';

interface BrutalistCardProps {
  title: string;
  tag: string;
  description: string;
  onAction: () => void;
}

export function BrutalistCard({ title, tag, description, onAction }: BrutalistCardProps) {
  return (
    <div className="border-4 border-black bg-yellow-300 p-6 shadow-[8px_8px_0px_0px_#000000] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
      <div className="flex items-center justify-between border-b-4 border-black pb-3">
        <span className="bg-black text-white px-3 py-1 font-mono text-xs uppercase font-bold tracking-wider">
          {tag}
        </span>
        <span className="font-mono text-xs font-bold uppercase">SEC-LOCKED</span>
      </div>
      <div className="mt-4">
        <h3 className="font-mono text-xl font-black uppercase tracking-tight text-black">
          {title}
        </h3>
        <p className="mt-2 font-mono text-sm leading-relaxed text-black/90">
          {description}
        </p>
      </div>
      <button
        onClick={onAction}
        className="mt-6 w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-black shadow-[4px_4px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000000] transition-all"
      >
        EXECUTE ACTION ->
      </button>
    </div>
  );
}
```

---

## Example 2: Terminal-Style Metric Strip

```tsx
export function BrutalistStatusStrip({ status }: { status: string }) {
  return (
    <div className="border-2 border-black bg-black text-white px-4 py-2 font-mono text-xs uppercase flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 bg-green-400 animate-pulse" />
        <span>SYSTEM STATUS: {status}</span>
      </div>
      <span className="text-neutral-400">LATENCY: 12ms</span>
    </div>
  );
}
```
