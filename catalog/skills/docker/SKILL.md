---
name: docker
description: Build and diagnose container images and local container workflows
  with appropriate caching, runtime permissions and secret handling.
---

# docker

## Overview

Build and diagnose container images and local container workflows with appropriate caching, runtime permissions and secret handling. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A Dockerfile, image, Compose service or container behavior is being changed or diagnosed. Match the operating model and deployment target.

## Rules & Patterns

Inspect the existing image, supported architecture, build context and runtime contract. Use the smallest maintainable image that actually supports required libraries, certificates, debugging and startup behavior.

Arrange dependency inputs for useful cache reuse, accounting for workspace manifests and generated files. Multi-stage builds help separate build tools from runtime content when that separation fits the application.

Prefer an unprivileged runtime and narrowly scoped capabilities. Build-time installation may require root; legitimate privileged workloads need explicit constraints rather than a blanket claim that root is impossible. Preserve required file ownership and volume behavior.

Keep secrets out of image layers, build arguments and logs. Use supported secret mounts or deployment-managed configuration. Pin image identity according to the project's update policy: a tag may move; a digest identifies specific bytes.

Use exec-form startup and the process lifecycle needed by the app. Verify signals, health/readiness and persistent data handling. A container running locally is not evidence of production orchestration readiness.

## Code Examples

For a Node service, install its real locked dependencies in a build stage, copy the required runtime output, and check startup, certificates and SIGTERM behavior under the selected user. Do not remove a runtime dependency solely to reduce image size.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Build and run the intended architecture and startup path when available.
- [ ] Check user permissions, mounted data, secret handling and shutdown behavior.

## Common Mistakes

Calling mutable tags immutable; copying .env into a layer; shrinking an image until runtime behavior breaks.

## Integration Notes

Optional companion guidance: security, ci-cd. Use it only when relevant and available; the skill does not install tools or authorize external actions.
