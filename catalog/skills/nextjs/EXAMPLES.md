# nextjs Examples — Anti-patterns vs ContextOS Standard

## Example 1: Server Components vs Client Components

### Anti-pattern: Marking the Entire Page as Client Component

```tsx
// BAD: app/dashboard/page.tsx with 'use client' at top
// Bloats client bundle, loses SEO benefits, eliminates direct DB access
'use client';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/dashboard').then(...) }, []);
  return <div>...</div>;
}
```

### Best practice: ContextOS Standard (RSC by Default, Client Leaf Nodes)

```tsx
// GOOD: Server Component fetches data directly with zero bundle cost
// app/dashboard/page.tsx (Server Component)
import { Suspense } from 'react';
import { db } from '@/lib/db';
import { InteractiveChart } from './InteractiveChart'; // 'use client' leaf component

export default async function DashboardPage() {
  const stats = await db.analytics.getStats();
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Total Revenue: {stats.revenue}</p>
      <Suspense fallback={<ChartSkeleton />}>
        <InteractiveChart initialData={stats.chartData} />
      </Suspense>
    </main>
  );
}
```
