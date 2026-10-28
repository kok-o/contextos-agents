---
name: nextjs
description: Implement and review Next.js routes, server/client boundaries, data
  loading, caching and application lifecycle behavior.
---

# nextjs

## Overview

Implement and review Next.js routes, server/client boundaries, data loading, caching and application lifecycle behavior. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The project uses Next.js. Inspect whether the affected route uses App Router or Pages Router and the installed framework/React versions.

## Rules & Patterns

Follow the actual routing and rendering model. Keep server-only code and secrets out of client imports, and place interactive boundaries where they serve the feature.

Authenticate and authorize protected server reads and mutations at their authoritative boundary. A Server Action is callable input, not a trusted internal function simply because its UI is private.

Start independent authorized I/O together, while retaining real dependencies. Choose loading/error/streaming boundaries that keep useful content understandable.

Check version-specific cache, revalidation and runtime APIs. Define data identity, freshness and invalidation; do not force static rendering, Edge runtime or shared caching onto personalized data.

Inspect production evidence before broad bundle changes. Barrel imports and package import optimizations depend on the package/framework; do not rewrite every import as a universal rule. Preserve navigation, metadata and hydration correctness.

## Code Examples

A public catalog may support shared caching with explicit invalidation; an account page needs its own identity and authorization policy. Verify the actual installed API instead of copying a route configuration from a different version.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Build the application and test the affected route, loading and error states.
- [ ] Verify server/client isolation, authorization and cache invalidation.

## Common Mistakes

Using the wrong router convention; hiding hydration errors; treating framework caching defaults as permanent; changing runtimes without compatibility checks.

## Integration Notes

Optional companion guidance: react, typescript, vercel-react-best-practices. Use it only when relevant and available; the skill does not install tools or authorize external actions.
