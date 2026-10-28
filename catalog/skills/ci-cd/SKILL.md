---
name: ci-cd
description: Create or repair CI/CD workflows using relevant checks,
  reproducible dependencies and explicit trust boundaries.
---

# ci-cd

## Overview

Create or repair CI/CD workflows using relevant checks, reproducible dependencies and explicit trust boundaries. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A build/test/deployment workflow needs implementation, debugging or review. Match checks to the repository and changed behavior.

## Rules & Patterns

Inspect the real scripts, supported runtimes, lockfile, trigger and deployment path. Reuse the project's checks; do not invent npm scripts, require a coverage percentage for every change, or add a language matrix the project does not support.

Separate trusted workflow/tool code from untrusted pull-request content. Use least-privilege tokens, appropriate secret availability and safe argv/environment boundaries. Avoid interpolating untrusted inputs into shell source or executing a consumer-controlled bootstrap as trusted tooling.

Use reproducible installs appropriate to the package manager and trust model. Decide how lifecycle scripts are handled without silently disabling a required build step. Validate workflow syntax and actual commands, not just the appearance of a YAML file.

Keep required checks meaningful. Repair a failing implementation or test rather than weakening a gate to obtain green. Deployment, publishing and credential changes follow existing user authorization; a passing local build does not establish hosted CI or deployment success.

## Code Examples

A forked pull request can run lint and tests with read-only access while an authorized release job consumes the reviewed artifact separately. Reproduce the failing local command before changing cache keys or deleting workflow steps.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Exercise the relevant success and failure paths and report local versus hosted evidence.
- [ ] Check workflow triggers, permissions, quoting and artifact identity where relevant.

## Common Mistakes

Passing secrets to untrusted PR code; downloading a floating tool as a trusted bootstrap; treating skipped checks as success.

## Integration Notes

Optional companion guidance: engineering-workflow, security. Use it only when relevant and available; the skill does not install tools or authorize external actions.
