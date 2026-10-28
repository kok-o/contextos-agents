---
name: node
description: Implement and diagnose Node.js services and tools using appropriate
  asynchronous work, errors, resources and process lifecycle handling.
---

# node

## Overview

Implement and diagnose Node.js services and tools using appropriate asynchronous work, errors, resources and process lifecycle handling. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task affects a Node.js service, CLI or library. JavaScript projects need not become TypeScript or Express applications.

## Rules & Patterns

Inspect Node/framework versions, module format and existing conventions. Use the actual supported API rather than inventing a helper or requiring a preferred framework.

Avoid blocking latency-sensitive request work with expensive synchronous operations. Synchronous operations may be appropriate in startup, build tools or small CLIs; async does not make CPU work free. Stream large payloads when that matches memory and backpressure requirements.

Handle async failures according to the framework. Express 5 forwards rejected returned promises from handlers; older versions or callback APIs may need explicit forwarding. Do not install express-async-errors for every async route by default.

Own connections, timers, streams and background work deliberately. Implement shutdown/draining where the process model requires it. Keep request-specific identity out of shared mutable module state.

Choose session/cache storage for durability and deployment needs; Redis is not mandatory for every application. Parameterize queries, validate inputs and use the project's established secret/configuration handling.

## Code Examples

For a failing Express route, reproduce the rejected promise under the installed version and verify the actual error middleware response. A maintenance CLI reading one small config file may reasonably use synchronous I/O.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Run the affected success/failure path under a supported Node version.
- [ ] Check cleanup, input validation and persistence/external effects separately when required.

## Common Mistakes

Applying Express-specific advice to every Node tool; blanket async or Redis rules; swallowing rejections; claiming process safety from a pure helper test.

## Integration Notes

Optional companion guidance: typescript, security, testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
