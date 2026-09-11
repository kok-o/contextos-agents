# Docker Examples — Anti-patterns vs ContextOS Standard

## Example 1: Multi-Stage Build & Layer Caching

### Anti-pattern: Anti-pattern (Fat single-stage image running as root)

```dockerfile
# BAD: 1.2GB image, runs as root, breaks caching on every file edit
FROM node:latest
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Best practice: ContextOS Standard (Slim multi-stage build with non-root user)

```dockerfile
# GOOD: 95MB image, non-root user, optimized layer caching
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
CMD ["node", "dist/main.js"]
```

---

## Example 2: Docker Ignore File (`.dockerignore`)

### Best practice: ContextOS Standard `.dockerignore`

```gitignore
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
dist
coverage
.DS_Store
*.md
```
