# Core skill standard

Objective: align all seven built-in skills with one proportional, evidence-based
engineering standard. Existing README edits belong to other work and are preserved.

## Acceptance criteria

- [x] English and Russian risk scenarios recognize deletion, authorization,
  IDOR, access control, payments, and routine documentation appropriately.
- [x] Safety guidance survives profile exclusions and small soft budgets.
- [x] Entrypoints, references, examples, and troubleshooting agree on existing
  authorization, proportional checks, optional roles, and scoped changes.
- [x] Five primary skills have distinct responsibilities; the two deprecated
  identifiers are thin compatibility aliases.
- [x] Executable examples are loaded from original Markdown and tested with
  valid inputs, rejected inputs, and deliberately broken implementations.
- [x] Validation metadata records check scope and limitations rather than a
  self-reported boolean; enforcement labels describe actual checker coverage.
- [x] Compiler, exports, lint, examples, and regression checks pass without drift.

## Implementation sequence

1. Add regression scenarios and fix risk/phase routing.
2. Align the seven source bundles and fix unsafe examples.
3. Run original examples, validate evidence reports, and correct checker claims.
4. Compile/export, run required checks, review the diff, and record evidence here.

## Verification boundary

Deterministic routing, examples, document structure, and exports can be checked
locally. These checks do not establish improved behavior in live AI clients.
Model comparisons require separate before/after runs with recorded settings.

## Implemented responsibilities

| Skill | Responsibility |
| --- | --- |
| engineering-workflow | Proportional lifecycle, existing authority, relevant checks |
| ponytail-mindset | Minimal maintainable implementation without removing boundaries |
| security | Identity, authorization, input, secrets, egress, and tool trust boundaries |
| gemini-precision | Gemini execution guidance without model-performance guarantees |
| context-os | Actual compiler, resolver, profile, graph, and export contracts |
| context-manager | Thin compatibility alias for context-os |
| gstack-roles | Thin workflow alias with optional review perspectives |

Canonical source bundles, root Gemini guidance, runtime risk selection, and rule
coverage labels now agree. Generated artifacts were rebuilt from those sources.
The report schema verifies shape and outcome consistency; it cannot establish
that someone really ran the commands listed in a report.

## Recorded verification, 2026-10-04

| Command or scenario | Result and scope |
| --- | --- |
| npm run build | Compiled and exported the canonical sources |
| npm run validate | 7 skills, 37 resources, 0 errors, 0 warnings |
| npm run lint:md | Passed for configured repository Markdown and all core bundles |
| npm test | 540 passed, 0 failed, 0 skipped; local Windows regression suite |
| node --test tests/core-skill-standard.test.js tests/skill-examples.test.js | 12 passed after the final inventory hardening |
| node scripts/verify-skill-examples.js --json | 59/59: 10 syntax, 42 behavioral, 7 structural checks; 0 unverified blocks |
| node .agents/ctx.js export all --check | No drift across 132 artifacts for 6 adapters |
| Local npm archive installation and init in a fresh temporary project | Offline installation; all 7 skills and 37 resources validate |
| Installed-package routing, aliases, and evidence CLI | Russian destructive/high/routine cases; both aliases; valid report accepted, invalid completion rejected |
| Installed-package export all and export all --check | 132 artifacts; no drift, global module search disabled |
| Scoped git diff --check | Passed for this task's files |

The first full-suite run caught an outdated approval/reviewer expectation. The
test now checks preserved authorization, relevant behavioral verification,
explicit review coverage, and security selection; the subsequent run passed.
Original-source mutation tests deliberately remove HMAC, port, input-field,
and numeric validation guards and confirm that the relevant scenarios fail.
Copied blocks, borrowed markers, and new JavaScript fences cannot inherit another
example's behavioral evidence.

The archive was created with npm pack --ignore-scripts and installed with
--offline --ignore-scripts. This is consumer evidence, not a publication.
Catalog coverage in the example gate remains limited to fastapi,
web-accessibility, and adapters in addition to all seven core bundles.
JavaScript/TypeScript syntax checks are not TypeScript type checks. Injected
transport and persistence tests do not establish production DNS/egress,
authentication, or database behavior. No paid model comparison was run.

Unrelated README changes and docs/README_DEMO_SCRIPT_RU.md were preserved.
A repository-wide whitespace check reports a pre-existing trailing blank line
in examples/quickstart/README.md; the scoped check for this task passes.
