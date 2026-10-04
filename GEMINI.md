# Gemini project instructions

Follow [.agents/AGENTS.md](.agents/AGENTS.md) and select relevant skills for the
actual task. Canonical source bundles live in .agents/core/skills; native and
Gemini projections are generated. Preserve unrelated edits and existing user
authorization.

Use engineering-workflow for proportional implementation and verification,
security for protected boundaries, ponytail-mindset for complexity choices, and
context-os for manifests, routing, profiles, and exports. gemini-precision adds
inspection/execution guidance when useful; it does not promise measured model
quality or speed gains.

Inspect actual symbols, callers, versions, and tests before changing code.
Implement required integrations completely. Run relevant checks according to
risk, including applicable project gates. A typo does not require a full feature
lifecycle or every test suite. Roles are optional; narrate meaningful decisions
in ordinary language.

For this source checkout, source/sync validation is
node .agents/ctx.js validate. Staged secret/placeholder checking is
node bin/index.js scan --staged --enforce --placeholders. Supply --scope <file>
with the actual scope JSON for write boundaries; inspect unstaged work separately.
A green validator or empty staged index does not prove application behavior.

Report changed behavior, commands/results, verification scope, and remaining
limitations. Publishing, deployment, destructive actions, and external messages
need authorization for that action unless already given. Do not request repeated
approval merely because a phase or role changed. Follow user/repository style
preferences without introducing a model-specific typography requirement.
