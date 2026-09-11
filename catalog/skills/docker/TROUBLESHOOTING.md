# Docker Troubleshooting Guide

## Common Issues & Fixes

### 1. Slow Docker builds rebuilding node_modules every time

- **Cause**: Copying the entire directory (`COPY . .`) before running `npm ci`.
- **Fix**: Copy `package.json` and `package-lock.json` separately first, run `npm ci`, and only then copy application source code.

### 2. Permission Denied Errors with Non-Root Users

- **Cause**: Files copied from builder without changing ownership.
- **Fix**: Always use `--chown=appuser:appgroup` when copying files in Dockerfile.

### 3. Missing native build dependencies on Alpine Linux

- **Cause**: Packages requiring C bindings (e.g. `sharp`, `bcrypt`) fail on musl libc.
- **Fix**: Add `RUN apk add --no-cache libc6-compat python3 make g++` in the builder stage.
