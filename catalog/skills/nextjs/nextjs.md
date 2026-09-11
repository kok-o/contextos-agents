# Next.js — Best Practices (App Router)

## Routing

- Use **App Router** (`app/` directory) — not Pages Router
- **Layouts** — shared UI in `layout.tsx`, nested layouts for sections
- **Loading states** — `loading.tsx` for Suspense boundaries
- **Error handling** — `error.tsx` for error boundaries per route
- **Not found** — `not-found.tsx` for 404 pages

## Server vs Client Components

- **Default to Server Components** — they're server by default
- **Use `'use client'`** only when you need: event handlers, useState, useEffect, browser APIs
- **Push client boundaries down** — keep as much as possible on the server
- **Don't pass functions** from Server to Client components

## Data Fetching

- **Server Components** — fetch directly, no useEffect
- **Server Actions** — for mutations (`'use server'`)
- **Route Handlers** — `app/api/` for REST endpoints
- **Parallel fetching** — use Promise.all for independent requests
- **Caching** — leverage Next.js cache, revalidate strategically

```tsx
// Server Component — direct fetch
async function UserProfile({ id }: { id: string }) {
  const user = await getUser(id); // No useEffect needed
  return <div>{user.name}</div>;
}
```

## File Structure

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Home page
├── globals.css
├── (auth)/                 # Route group (no URL impact)
│   ├── login/page.tsx
│   └── register/page.tsx
├── dashboard/
│   ├── layout.tsx          # Dashboard layout
│   ├── page.tsx            # Dashboard home
│   └── settings/page.tsx
├── api/
│   └── users/route.ts      # API route
└── components/             # Shared components
```

## Performance

- **Image optimization** — always use `next/image`
- **Font optimization** — use `next/font`
- **Metadata** — export metadata object from pages
- **Static generation** — prefer SSG over SSR when possible
- **Edge runtime** — for latency-sensitive routes

## Anti-Patterns

- [FAIL] Using `useEffect` for data fetching in Server Components
- [FAIL] Making everything a Client Component
- [FAIL] Not using `loading.tsx` and `error.tsx`
- [FAIL] Importing server-only code in Client Components
- [FAIL] Not leveraging caching and revalidation
