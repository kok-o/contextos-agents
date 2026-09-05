# gstack-roles Troubleshooting & Common Mistakes

## 1. Persona Abandonment

- **Symptom**: Agent stops declaring its role and drifts back into generic assistant voice.
- **Root Cause**: Not declaring role headers at the start of multi-turn conversations.
- **Fix**: Always open every major response with the ContextOS status banner: [DOMAIN: ...] [PHASE: ...] [ROLE: ...].

## 2. Mismatched Role Authority

- **Symptom**: Junior Developer persona trying to override Architectural Decisions without ADR review.
- **Root Cause**: Role boundary confusion.
- **Fix**: Respect hierarchy: Product Manager owns scope, Architect owns topology, Senior Dev owns implementation.
