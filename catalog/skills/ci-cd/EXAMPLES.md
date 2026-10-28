# ci-cd scenarios

## In scope

A forked pull request can run lint and tests with read-only access while an authorized release job consumes the reviewed artifact separately. Reproduce the failing local command before changing cache keys or deleting workflow steps.

## Verification

Exercise the relevant success and failure paths and report local versus hosted evidence.

Check workflow triggers, permissions, quoting and artifact identity where relevant.

These scenarios describe what to verify. Prose is not proof that a framework, service or AI client executed the workflow. Use real project fixtures and report unavailable integrations.
