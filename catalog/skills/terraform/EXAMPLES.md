# terraform scenarios

## In scope

When moving a resource into a module, inspect its current address/state and the proposed plan. Verify whether the tool/provider proposes replacement, and preserve the existing resource identity where the requested refactor requires it.

## Verification

Check target account/workspace, plan identity and relevant resource changes.

Report plan versus apply versus verified resulting state separately.

These scenarios describe what to verify. Prose is not proof that a framework, service or AI client executed the workflow. Use real project fixtures and report unavailable integrations.
