# performance Examples — Anti-patterns vs ContextOS Standard

## Example 1: Dynamic Imports for Heavy Libraries

### Anti-pattern: Static Import of Heavy Visualizers in Initial Bundle

```typescript
// BAD: Adds 800KB (Monaco editor or Three.js) to the critical first-paint bundle!
import { CodeEditor } from '@/components/CodeEditor';

export default function Page() {
  return <div><CodeEditor /></div>;
}
```

### Best practice: ContextOS Standard (Lazy Load on Demand)

```typescript
// GOOD: Dynamic import splits chunk, only downloads when component renders
import dynamic from 'next/dynamic';

const CodeEditor = dynamic(
  () => import('@/components/CodeEditor'),
  { loading: () => <EditorSkeleton />, ssr: false }
);

export default function Page() {
  return <div><CodeEditor /></div>;
}
```
