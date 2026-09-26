---
name: docker
description: Docker containerization, multi-stage builds, non-root security, layer caching optimization, and docker-compose standards.
---

# Docker

## Overview

Containerization, Dockerfile architecture, multi-stage compilation, security hardening, and container orchestration for production workloads.

## When to Use

Activate when creating or optimizing Dockerfiles, docker-compose configurations, container security audits, CI/CD container build stages, or production container deployments.

## Rules & Patterns

### Negative Constraints (What NOT to Do)

1. **NEVER run containers as `root` in production**: Always create and switch to an unprivileged non-root user (e.g. `USER node` or `USER nonroot`).
2. **NEVER use the `latest` tag**: Always pin base images to specific immutable version digests or explicit minor tags (e.g. `node:22-alpine3.20` or `python:3.12-slim-bookworm`).
3. **NEVER copy source code before dependency manifests**: Always copy package manifests (`package.json`, `pnpm-lock.yaml`, `pyproject.toml`) and install dependencies first to maximize Docker layer cache hits.
4. **NEVER bake secrets, API keys, or `.env` files into image layers**: Pass secrets via build-time secret mounts (`--mount=type=secret`) or runtime environment variables injected by the orchestrator.
5. **NEVER include build tools or devDependencies in the final runner image**: Always use multi-stage builds to discard compilers, package managers, and temporary build caches from production images.
6. **NEVER run without a `.dockerignore` file**: Always exclude `.git`, `node_modules`, `.env*`, and build outputs from the Docker build context.

---

### Pattern 1: Node.js / Next.js Standalone Multi-Stage Dockerfile

Optimized multi-stage build producing minimal production images (<120MB) with non-root security:

```dockerfile
# ── Stage 1: Dependencies ─────────────────────────────────────────────
FROM node:22-alpine3.20 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else yarn --frozen-lockfile; \
  fi

# ── Stage 2: Builder ──────────────────────────────────────────────────
FROM node:22-alpine3.20 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: Production Runner ────────────────────────────────────────
FROM node:22-alpine3.20 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output and static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
```

---

### Pattern 2: Python / FastAPI Multi-Stage Dockerfile (uv)

High-performance Python build utilizing `uv` for sub-second installs and slim final layers:

```dockerfile
# ── Stage 1: Build virtual environment ────────────────────────────────
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies before code to leverage layer cache
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ── Stage 2: Runtime Runner ───────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runner
WORKDIR /app

# Create unprivileged application user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

COPY --from=builder --chown=appuser:appgroup /app /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health').read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

---

### Pattern 3: Essential `.dockerignore` Template

Every repository must include a `.dockerignore` to prevent uploading secrets and heavy cache folders:

```text
.git
.github
node_modules
npm-debug.log
.env
.env.*
!.env.example
dist
build
.next
.cache
coverage
*.md
Dockerfile*
docker-compose*.yml
```

---

## Validation Checklist

- [ ] Multi-stage build separates build compilers from production runtime.
- [ ] Non-root `USER` directive is active in the final image stage.
- [ ] Base images are pinned to explicit, immutable release tags.
- [ ] `HEALTHCHECK` directive is defined with reasonable interval and timeout.
- [ ] `.dockerignore` prevents leaking local `.env` files and `node_modules`.
- [ ] Dependencies are copied and installed before copying source code.

## Common Mistakes

- **Running as root**: Leaves the host system vulnerable if a container breakout vulnerability occurs.
- **Copying entire source before install**: Invalidates the Docker layer cache on every code edit, slowing CI builds.
- **Omitting HEALTHCHECK**: Orchestrators cannot detect frozen or zombie worker processes.

## Integration Notes

Interacts with `security` (container hardening) and `node` / `nextjs` / `fastapi`.
