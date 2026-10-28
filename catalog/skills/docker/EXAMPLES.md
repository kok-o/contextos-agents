# docker scenarios

## In scope

For a Node service, install its real locked dependencies in a build stage, copy the required runtime output, and check startup, certificates and SIGTERM behavior under the selected user. Do not remove a runtime dependency solely to reduce image size.

## Verification

Build and run the intended architecture and startup path when available.

Check user permissions, mounted data, secret handling and shutdown behavior.

These scenarios describe what to verify. Prose is not proof that a framework, service or AI client executed the workflow. Use real project fixtures and report unavailable integrations.
