# ContextOS Core Architecture

## Product boundary

The stable `contextos-agents` package manages version-controlled engineering context for supported AI coding agents. It validates source skills and manifests, resolves relevant rules, compiles agent-native files, and detects configuration drift.

The MCP server is a separate beta package. Agent orchestration and code-execution runtime features are experimental and are not part of the stable core contract.

## Core data flow

```mermaid
flowchart TD
    A[Version-controlled skills and manifests] --> B[Validation and registry compilation]
    C[Project profile] --> D[Context resolver]
    B --> D
    D --> J[Task-specific skill recommendation]
    A --> E[Agent adapters]
    C --> E
    E --> F[Safe transactional writer]
    F --> G[Client-specific configuration and templates]
    G --> H[Lockfile and drift detection]
    H --> I[Local validation and CI quality gate]
```

## Components

### Canonical sources and validation

Engineering skills, rules, and profiles live in the project and are validated before they become generated agent configuration. Registry compilation provides a normalized index for resolution and validation.

### Resolver and adapters

The resolver recommends rules and skills for a task, with a soft budget covering selected skill bodies. Ordinary adapters discover all effective installed skills and apply profile exclusions; they do not automatically consume task resolution. Discovery is shared with the compiler and includes standalone/bundle plugins, vendor skills and project overrides. The compatibility matrix distinguishes native configuration from instruction indexes and manual templates.

### Safe updates and generated files

Filesystem writes use project-relative paths, mutation locks, and journaled transactions. The lockfile records managed outputs so validation can detect drift and updates can preserve user changes.

### CI quality gate

The `gate` command checks adapter configuration drift. Application tests, typechecks, secret scanning and policy validation are separate checks; passing this gate does not establish application correctness.

## Separate packages and experimental features

The read-only MCP server is maintained in `contextos-mcp` and remains beta. Task routing, subagent orchestration, and execution sandboxes are experimental; they carry separate requirements and guarantees from the stable context compiler.
