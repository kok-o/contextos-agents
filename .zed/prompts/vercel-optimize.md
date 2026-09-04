# ContextOS — vercel-optimize

> Observability-first Vercel performance and cost reduction optimization skill.

# Vercel Optimize

## Overview

Observability-first Vercel performance and cost reduction optimization skill. Evaluates deployed Next.js, SvelteKit, Nuxt, and Astro projects using production telemetry signals (`signals.json`), deterministic candidate gating, and code scanning to deliver ranked, verified architectural recommendations.

## When to Use

- When tasked with reducing Vercel bills, Function Invocations, Fast Data Transfer, or Build Minutes.
- When diagnosing slow serverless routes, cold starts, or Edge vs Node runtime mismatches.
- When evaluating caching opportunities (`stale-while-revalidate`, ISR, CDN edge caching) or Core Web Vitals degradation.

## Rules & Patterns

### 1. Prerequisites & Framework Support

- Vercel CLI v53+ with `vercel metrics`, `vercel usage`, `vercel contract`, and `vercel api`.
- Authenticated CLI session (`vercel login`) and linked app directory (`vercel link`).
- Framework support: Next.js App Router (Full), Pages Router (Supported), SvelteKit (Supported), Nuxt (Supported), Astro (Limited).
- Security rule: Never put auth tokens in shell commands (`VERCEL_TOKEN=...` is banned in chat/logs).

### 2. Core Doctrine & Gating Pipeline

- **Metrics First:** Recommendations start from Vercel production signals (14-day window), not repo-wide grep.
- **Deterministic Gates:** `scripts/gate-investigations.mjs` selects code-scope and platform-scope candidates.
- **Candidate-Bound Scope:** Inspect only files named by a candidate or a route-local import chain.
- **Version-Aware Citations:** Use only verified citations matching the target framework version.
- **Specific Cache Policies:** When recommending caching, state the exact cache policy and headers; keep auth-sensitive and error responses dynamic.

### 3. Recommendation Rules

- Every recommendation must trace to a launched candidate and include observed metric evidence.
- Cite verified files with line numbers when code changes are proposed.
- Use precise observed performance numbers; avoid customer-facing speculative `$N` savings formulas.
- Do not recommend duration reductions for Vercel Workflow runtime endpoints (`/.well-known/workflow/v1/*`).

## Code Examples

```typescript
// [GOOD] Next.js Route Segment Config for Caching & Edge Runtime
export const dynamic = 'force-static';
export const revalidate = 3600; // Cache at Edge for 1 hour

export default async function CachedCatalogPage() {
  const products = await getCatalogData();
  return <CatalogGrid items={products} />;
}
```

```bash
# Running the signals collection and gate
node scripts/collect-signals.mjs [projectId] > "$RUN_DIR/vercel-signals.json"
node scripts/scan-codebase.mjs <repo-root> > "$RUN_DIR/codebase.json"
node scripts/merge-signals.mjs "$RUN_DIR/vercel-signals.json" "$RUN_DIR/codebase.json" --out "$RUN_DIR/signals.json"
node scripts/gate-investigations.mjs "$RUN_DIR/signals.json" > "$RUN_DIR/gate.json"
```

## Validation Checklist

- [ ] Project is properly linked with valid team/personal scope (`vercel link`).
- [ ] Production metrics signals collected across 14-day window before inspecting code.
- [ ] No secrets or tokens passed in command line arguments.
- [ ] Recommendations grounded in specific verified file paths and line numbers.
- [ ] Unsafe or auth-sensitive paths kept strictly dynamic.

## Common Mistakes

- Inspecting repository source code before metric signals exist.
- Hardcoding `VERCEL_TOKEN` into terminal commands or prompt logs.
- Recommending duration reductions on long-lived streaming routes or workflow runners.
- Applying static caching to user-specific or authenticated routes.

## Integration Notes

- Complements `nextjs` and `react-best-practices` for server-side optimization.
- Pairs with `performance` and `security` skills.

