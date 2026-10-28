---
name: testing
description: Choose and implement proportionate tests for observable behavior,
  important failures and integration boundaries.
---

# testing

## Overview

Choose and implement proportionate tests for observable behavior, important failures and integration boundaries. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

The task adds tests, fixes a regression or needs verification evidence. Reuse the project's language and runner rather than forcing a JavaScript testing stack.

## Rules & Patterns

Identify the behavior that can fail and the cheapest reliable layer that observes it. Select unit, contract, integration or browser checks according to risk; no fixed percentage pyramid or whole-suite time limit applies to every project.

Prefer assertions on behavior and relevant failures. Avoid tests that merely repeat an implementation, count instruction phrases or replace the behavior under test with a stub.

Use real small components where practical. Mock a boundary when isolation or unavailable infrastructure warrants it, and state what that mock does not verify. Dependency injection and controllable clocks can make nondeterministic cases testable.

Keep state isolated and readiness explicit. Use supported retrying assertions or events instead of arbitrary sleeps. Choose user-facing locators where suitable; a stable test ID or scoped selector can be appropriate when semantics do not uniquely identify the target.

Run the relevant checks and report failures, skips and environment limits. Coverage describes executed code, not proof of correctness; TDD is an available technique rather than mandatory ceremony for every change.

## Code Examples

For an authorization fix, verify an allowed caller and a denied caller through the real boundary. For a pure calculation, use focused cases rather than installing a browser runner. A mock API test does not establish real persistence.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Confirm that the test fails for the targeted broken behavior when feasible.
- [ ] Distinguish unit, integration, simulated and real-browser evidence.

## Common Mistakes

Implementation-mirroring tests; arbitrary coverage goals; substituting a mock for the claimed integration; omitting a meaningful failure case.

## Integration Notes

Optional companion guidance: engineering-workflow, webapp-testing. Use it only when relevant and available; the skill does not install tools or authorize external actions.
