# nextjs Troubleshooting & Common Mistakes

## 1. Hydration Mismatch Errors

- **Symptom**: "Text content does not match server-rendered HTML".
- **Root Cause**: Rendering dates, window dimensions, or local storage data that differs between server render and client hydration.
- **Fix**: Use suppressHydrationWarning on localized timestamps or load client-only state inside a useEffect after mount.

## 2. Accidental Server Code Bundled to Client

- **Symptom**: "Module not found: Can't resolve 'fs' or 'pg' in client bundle".
- **Root Cause**: Client component importing a utility that transitively imports server-only database code.
- **Fix**: Separate server utilities into *.server.ts and install import 'server-only'; at the top of server files.

## 3. Waterfall Fetches in Server Components

- **Symptom**: Page takes 3 seconds to load due to sequential await statements.
- **Root Cause**: Awaiting independent data sources one after another.
- **Fix**: Use Promise.all([fetchUsers(), fetchProducts()]) or separate into nested <Suspense> boundaries.
