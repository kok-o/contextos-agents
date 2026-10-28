---
name: terraform
description: Inspect and change Terraform or OpenTofu infrastructure with
  explicit target, state, plan and authorization boundaries.
---

# terraform

## Overview

Inspect and change Terraform or OpenTofu infrastructure with explicit target, state, plan and authorization boundaries. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

An actual Terraform/OpenTofu configuration, plan, state issue or infrastructure refactor is in scope.

## Rules & Patterns

Inspect tool/provider versions, workspace/account, backend, state ownership and existing deployment workflow. Verify syntax and provider semantics against the installed tooling.

Use formatting, validation and a scoped plan appropriate to the task. Plans and state may contain secrets; handle their storage and logs accordingly. A plan can contact providers and does not itself authorize an apply.

For replacement, destroy or state operations, verify the exact affected resources and current authorization. Preserve an appropriate recovery path. Reuse existing approval where it covers the actual reviewed effect; a guide does not grant blanket auto-approval.

Use moved/import mechanisms supported by the tool for identity-preserving refactors when appropriate. Inspect the resulting plan; a moved block is not a universal guarantee of zero downtime.

Apply only the intended reviewed plan through the authorized workflow and verify relevant resulting state. Do not introduce modules, providers or environment restructuring for a small change without a concrete need.

## Code Examples

When moving a resource into a module, inspect its current address/state and the proposed plan. Verify whether the tool/provider proposes replacement, and preserve the existing resource identity where the requested refactor requires it.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Check target account/workspace, plan identity and relevant resource changes.
- [ ] Report plan versus apply versus verified resulting state separately.

## Common Mistakes

Treating plan as permission to apply; logging state secrets; assuming moved blocks guarantee availability; changing the wrong workspace.

## Integration Notes

Optional companion guidance: security, decisions, engineering-workflow. Use it only when relevant and available; the skill does not install tools or authorize external actions.
