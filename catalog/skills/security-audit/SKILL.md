---
name: security-audit
description: Review concrete security boundaries and validate findings with
  scoped evidence, using an expanded audit workflow only when appropriate.
---

# security-audit

## Overview

Review concrete security boundaries and validate findings with scoped evidence, using an expanded audit workflow only when appropriate. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

Security questions, threat modeling, focused vulnerability review or an explicitly requested broader audit. A routine fix does not automatically require a multi-agent audit.

## Rules & Patterns

Define the assets, trust boundaries, authorized target and relevant threat model. Trace identity, ownership, untrusted inputs and sensitive operations. Distinguish a candidate concern from a demonstrated defect.

For a finding, record the entry point, transformations, authorization decision, sink and bounded consequence. Use disposable data for reproduction. Check real filesystem containment, including link ancestors; a string prefix is not a directory boundary.

For untrusted target execution, use actual available isolation, remove credentials, limit writes and constrain network access as appropriate. A scratch directory alone is not an OS sandbox. Existing authorized development checks remain governed by the task and environment.

Use independent verification when available and authorized for a consequential audit; a second role label in one model is self-review. If tools, isolation, live services or independent review are unavailable, state the resulting evidence limit and continue useful in-scope work.

Produce artifacts proportionate to the request. A focused review can report a concise source trace and reproduction; do not create a fixed report bundle, numerical risk score or false attestation for every security question.

## Code Examples

See EXAMPLES.md for an executable existing-file containment check, its symlink/prefix regressions and its concurrency/authorization limits. The example is not a substitute for a maintained race-safe filesystem boundary.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Verify allowed and denied cases and attempt to disprove a candidate finding.
- [ ] Separate static reasoning, local reproduction, independent review and unavailable deployment checks.

## Common Mistakes

Prefix-only containment; executing untrusted code with ambient credentials; presenting unverified hypotheses as confirmed vulnerabilities; claiming isolation the tools do not provide.

## Integration Notes

Optional companion guidance: security, engineering-workflow. Use it only when relevant and available; the skill does not install tools or authorize external actions.
