---
name: nestjs
description: Implement and review NestJS modules, dependency injection, request
  boundaries and service lifecycle behavior.
---

# nestjs

## Overview

Implement and review NestJS modules, dependency injection, request boundaries and service lifecycle behavior. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The application actually uses NestJS or a requested change selects it. Preserve its installed version and existing module conventions.

## Rules & Patterns

Inspect controllers, providers, modules and the actual validation/auth configuration. Register new dependencies in the real module path rather than producing unused classes.

Use DTOs or another configured runtime schema at the boundary. TypeScript annotations alone do not validate requests. Decide how unknown privilege-bearing fields are rejected and authorize the requested object separately from input parsing.

Keep controller and service responsibilities understandable at the project's scale. Extract reusable or complex business behavior when it helps; do not add layers solely to match a template.

Handle errors, resource cleanup and async work using the framework's supported APIs. Check dependency scope to avoid putting request identity into a shared provider's mutable state.

## Code Examples

For a new order route, verify the provider is registered, a denied user cannot read another tenant's order, and invalid runtime input is rejected by the actual configured pipe/schema.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Run relevant module/endpoint tests and the project's type/build checks.
- [ ] Exercise validation, authorization and resource/error paths.

## Common Mistakes

Assuming a DTO type performs validation by itself; unregistered providers; shared request state; unnecessary abstractions.

## Integration Notes

Optional companion guidance: node, typescript, security. Use it only when relevant and available; the skill does not install tools or authorize external actions.
