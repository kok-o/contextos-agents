---
name: docker
description: Docker containerization, multi-stage builds, non-root security, layer caching optimization, and docker-compose standards.
---

# Docker

## Overview

Containerization, Dockerfile architecture, security best practices, and container orchestration for production workloads.

## When to Use

Activate when creating or optimizing Dockerfiles, docker-compose configurations, container security audits, or CI/CD container builds.

## Rules & Patterns

### Negative Constraints (What NOT to Do)

1. **NEVER run containers as `root` in production**: Always create and switch to an unprivileged non-root user (e.g. `USER node` or `USER nonroot`).
2. **NEVER use the `latest` tag**: Always pin base images to specific immutable version digests or explicit minor tags (e.g. `node:20.12.2-alpine3.19`).
3. **NEVER copy source code before `package.json`**: Always copy lockfiles and install dependencies first to leverage Docker's layer caching.
4. **NEVER bake secrets, API keys, or `.env` files into image layers**: Pass secrets via build-time secret mounts (`--mount=type=secret`) or runtime environment variables.
5. **NEVER include build tools or devDependencies in the final runner image**: Always use multi-stage builds to discard compilers and package managers from production images.

### Multi-Stage Standard Pattern

```dockerfile
FROM node:20.12.2-alpine3.19 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

FROM node:20.12.2-alpine3.19 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S -g 1001 appgroup && adduser -S -u 1001 appuser -G appgroup
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
USER appuser
CMD ["node", "dist/index.js"]
```

## Code Examples

See `EXAMPLES.md` for production Dockerfiles and dockerignore patterns.

## Validation Checklist

- [ ] Multi-stage build separates build tools from runtime
- [ ] Non-root `USER` directive active in final stage
- [ ] Base images pinned to exact versions
- [ ] `.dockerignore` file prevents leaking node_modules or secrets

## Common Mistakes

- Copying entire workspace before `npm ci`, breaking Docker cache. See `TROUBLESHOOTING.md`.

## Integration Notes

Interacts with `security` (container hardening) and `node` / `nextjs` / `fastapi`.
