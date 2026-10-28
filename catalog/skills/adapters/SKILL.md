---
name: adapters
description: >
  Configure and verify ContextOS exports for Gemini/Antigravity, Claude Code,
  Cursor, GitHub Copilot, Aider, and Zed without editing generated projections.
---

# adapters

## Overview

Export installed ContextOS rules into six supported client formats. This skill
documents the exporters; the CLI performs compilation and filesystem changes.
Generated files prove delivery, not client loading or model adherence.

## When to Use

Configure, synchronize, or diagnose agent rules across the supported clients.
Do not assume a catalog skill is installed just because it exists in the catalog.

## Rules & Patterns

Inspect the target project, winning manifest, declared entrypoint, resources,
and active profile first. Canonical built-ins live in `.agents/core/skills/`;
project additions and overrides belong in `.agents/project/skills/`. Plugins
provide additional sources. Never edit native projections to change source rules.

## Supported Agents

The table shows the default `auto` outputs. Replace `<skill>` with the installed
skill ID. Declared resources are also copied beside Gemini and Claude auto skills.

| Agent | Config Target | Delivery |
| --- | --- | --- |
| **Gemini / Antigravity** | `.agents/skills/<skill>/SKILL.md`, `.agents/generated/gemini/skills/<skill>/SKILL.md` | Shared native skill and generated copy |
| **Claude Code** | `.claude/skills/<skill>/SKILL.md` | Native on-demand skill |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Managed block with source paths and routing descriptions |
| **Cursor** | `.cursor/rules/<skill>.mdc` | MDC rule with description, globs, and alwaysApply |
| **Aider** | `.aider.conf.yml`, `CONVENTIONS.md` | YAML read entry for conventions; on-demand source references |
| **Zed IDE** | `.zed/rules.md`, `.zed/prompts/<skill>.md` | Rule index and separate prompt body |

When `.agents/AGENTS.md` exists, Cursor also emits
`.cursor/rules/00-project-rules.mdc`, Zed emits `.zed/prompts/contextos.md`,
and Copilot, Aider, and Zed include project rules in their instruction files.
Claude does not generate `CLAUDE.md` or `.agents/generated/claude/`;
Cursor does not generate a legacy `.cursorrules` fallback.

## Activation

Set `activation` and `globs` in the winning manifest or entrypoint frontmatter.
Absent both, known catalog path scopes apply; otherwise the default is `auto`.
The resolver's `signals.fileGlobs` affects recommendations, not adapter activation.

| Target | Activation | Native artifacts | Metadata / behavior |
| --- | --- | --- | --- |
| `gemini` | `auto` | `.agents/skills/<skill>/SKILL.md`, `.agents/generated/gemini/skills/<skill>/SKILL.md` | Description-based discovery; no activation rule |
| `gemini` | `always` | `.agents/skills/<skill>/SKILL.md`, `.agents/generated/gemini/skills/<skill>/SKILL.md`, `.agents/rules/contextos-<skill>.md` | Rule trigger is always_on |
| `gemini` | `globs` | `.agents/skills/<skill>/SKILL.md`, `.agents/generated/gemini/skills/<skill>/SKILL.md`, `.agents/rules/contextos-<skill>.md` | Rule trigger is glob; additional bounded Windows rule files may be emitted |
| `claude` | `auto` | `.claude/skills/<skill>/SKILL.md` | Name and description frontmatter; body on demand |
| `claude` | `always` | `.claude/rules/<skill>.md` | Full body without paths frontmatter |
| `claude` | `globs` | `.claude/rules/<skill>.md` | Full body with paths list |
| `cursor` | `auto` | `.cursor/rules/<skill>.mdc` | Agent-requested description, empty globs, alwaysApply false |
| `cursor` | `always` | `.cursor/rules/<skill>.mdc` | Empty globs, alwaysApply true |
| `cursor` | `globs` | `.cursor/rules/<skill>.mdc` | Declared globs, alwaysApply false |

Copilot, Aider, and Zed inline `always` skill bodies in their instruction files.
Other skills remain routing references there; Zed also emits every skill's prompt
body. These three adapters do not enforce per-file glob activation. Markdown
resource links are relocated when entrypoints move; load supporting files only
when needed. Export selects installed skills allowed by the profile, not just the
resolver's recommendation for the current task.

## Generation Commands

- `contextos compile` validates manifests and rebuilds the registry.
- `contextos export <agent>` renders and applies one of the six targets above.
- `contextos export all` applies all adapters in one transaction.
- `contextos export all --check --json` checks drift without writing outputs.
- `contextos export all --dry-run --json` inspects planned artifacts.

In this source checkout, use `node .agents/ctx.js` instead of `contextos`.
After source edits, compile, export, then check. A successful check means the
selected projections match their sources and recorded ownership; it does not
prove that a live client loaded them. Review ownership conflicts instead of
automatically forcing replacement. Aider merges its YAML read list and preserves
existing settings; inspect new defaults before running the client.

## Code Examples

See [EXAMPLES.md](EXAMPLES.md) for the default adapters skill outputs and a
path-scoped activation example.

## Validation Checklist

- [ ] Correct project root, winning manifest, entrypoint, resources, and profile.
- [ ] Expected native path and activation metadata for each selected client.
- [ ] Compile succeeds, export preserves user changes, and check reports no drift.
- [ ] Generated-file evidence and any live-client testing are reported separately.

## Common Mistakes

Editing outputs, confusing resolver selection with export scope, assuming every
adapter implements file globs, or treating a generated file as model-quality proof.
Do not expect Continue or OpenHands exports; they are not registered targets.

## Integration Notes

Use context-os for manifest, resolver, profile, and budget configuration;
engineering-workflow owns proportional implementation and verification.
