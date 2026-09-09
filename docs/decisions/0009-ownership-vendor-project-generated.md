# ADR-009: 3-Tier Ownership Model (Vendor, Project, and Generated)

## Status
Accepted

## Context
When an open-source tool modifies files in a user repository, conflicts inevitably arise between upstream updates and user customizations. Without clear ownership boundaries, updaters either destructively overwrite user modifications or fail completely.

## Decision
Establish a strict 3-tier ownership partition:
1. `.agents/vendor/`: Upstream canonical skills, core profiles, and schemas. Owned exclusively by ContextOS updates.
2. `.agents/project/`: User-defined skills, project-specific rule customizations, and policy overrides. Never overwritten by upstream updates.
3. `.agents/generated/`: Compiled assistant rules and adapter artifacts (`.cursorrules`, `.cursor/rules/*.mdc`, `.zed/rules.md`). Managed deterministically by the export pipeline.

## Alternatives Considered
- *Single flat directory*: Leads to dirty diffs and unresolvable merge conflicts during tool updates.
- *External global cache outside repository*: Breaks team sharing and version control of assistant configurations.

## Trade-offs
- Requires path mapping and multi-directory resolution in skill collectors.
- Safe automated updates, transparent team collaboration in Git, and zero accidental loss of user customizations.

## Impact
- Informs updater logic in `bin/commands/update.js` and upcoming Milestone 17.
