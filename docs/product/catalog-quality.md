# ContextOS skill verification scope

Updated 28 October 2026. These checks verify declared local scenarios; they do not
certify the entire catalog or guarantee that an AI client follows instructions.

## Coverage

All seven core skills are included: `engineering-workflow`, `ponytail-mindset`,
`security`, `gemini-precision`, `context-os`, `context-manager`, and `gstack-roles`.
Executable core blocks must have a registered scenario that loads their original
Markdown source. Unregistered executable blocks fail the gate.

The example gate covers four of the 46 catalog skills: `fastapi`,
`web-accessibility`, `adapters`, and `typescript`. Separate tests execute the
security-audit containment example and the Vercel telemetry helpers. The other
catalog entries have editorial and installation/export checks without equivalent
execution of their domain workflows. Passing `validate --catalog` does not change
that boundary.

The example-gate inventory contains 23 blocks: 14 runnable and nine illustrative.
Two core aliases contain no code blocks; their canonical routing and report
contracts are checked instead.

| Check category | Count | What passing establishes |
| --- | ---: | --- |
| Syntax parsing | 13 | Original JS/TS/TSX/Python blocks parse; no TypeScript type checking |
| Behavioral tests | 40 | Declared resolver and original-source example scenarios pass |
| Structural contracts | 12 | Seven report schemas, three CSS assertions and two CLI registry assertions pass |
| Fixture simulations | 3 | Mock dialog transitions pass; no browser focus or accessibility certification |
| Total | 68 | All declared checks pass, with zero unregistered core executable blocks |

## Scenario boundaries

- Core scenarios cover proportional task routing, safety under a small budget,
  aliases, prompt assembly and executable security/minimalism/Gemini examples.
  Schema validation proves report structure, not that reported commands ran.
- Security HMAC and SSRF examples execute from their original blocks. Controlled
  transport checks URL restrictions; production DNS and network egress isolation
  require separate acceptance.
- TypeScript's original `isUser` guard checks every required field. Ten cases
  include missing fields, wrong types, invalid roles and arrays. A mutation
  restoring the previous `id`-only implementation fails five cases. Data shape
  validation does not authorize a caller's role.
- FastAPI blocks receive original-source Python AST parsing. The legacy runner's
  copied snippets no longer inflate behavioral totals. Framework imports,
  database dependencies and HTTP endpoint execution remain unverified.
- Accessibility checks inspect the original CSS and simulate a dialog. Real
  keyboard focus, assistive technology and React component behavior remain
  unverified. The adapter example checks the CLI command registry; broader
  adapter behavior is tested in the main consumer suites.

The reviewed-block loader is a test harness, not an OS security sandbox. Parser
and fixture dependencies belong to development checks and are not required by
installed consumers.

## Focused frontend catalog

The eight focused frontend skills have a separate integration scenario in
`tests/catalog-export-integration.test.js`: real preset installation, explicit
selection, English/Russian task routing, exclusion on an unrelated backend task,
six-adapter rendering, resource delivery and drift after a reference changes.
The production tarball preset is also covered by `tests/consumer-init.test.js`.

These checks establish installation/routing/export contracts. They do not run
an AI model, benchmark instruction quality, or certify a real application's
appearance, accessibility or browser behavior. The Playwright pattern is an
illustrative example with stated prerequisites; it is not included in the
68-check executable-example snapshot above. Sources and adaptation changes are
recorded in each skill's `SOURCES.json`.

## Reproduce

```sh
node scripts/verify-skill-examples.js
node scripts/verify-skill-examples.js --json
node --test tests/skill-examples.test.js tests/core-skill-standard.test.js
node --test tests/skill-catalog-quality.test.js tests/catalog-export-integration.test.js
node .agents/ctx.js validate --catalog
```

JSON is the authority for counts after source changes. Every additional catalog
skill needs an explicit scope and meaningful scenarios before its behavior can
be described as verified. Type checking, live clients, browser accessibility and
application execution require their own evidence.

## Whole-catalog improvement review

The [inventory](skill-inventory.json) accounts for all seven core and 46 catalog
entries. The 28 October review updated 35 entries and retained 16 after review.
Compatibility redirects remain available. Each active catalog skill compiles and
explicitly resolves on its own without unrelated instruction dependencies. The
complete 53-entry fixture compiles and renders through all six adapters, checking
declared resource delivery and drift. Registry descriptions match the entrypoints.

Two additional catalog adaptations, `humanizer` and `kill-ai-slop`, cover prose
editing and generic-interface review. Each includes a pinned upstream commit,
license and ContextOS modification notes. They are self-contained instructions;
upstream executable scanners are not bundled. Their focused integration test
checks English/Russian selection, unrelated-task exclusion and resource delivery
through six adapters. These checks do not establish model adherence or improved
writing/design outcomes in a real client.

The quality suite executes the original security-audit containment block against
valid files, sibling prefixes, traversal, absolute paths and links escaping the
root. This check does not make the example race-safe or authorize access.
Vercel helper checks cover explicit demo mode, supplied metrics, project identity,
missing observations, provenance through merge, private/cacheable route handling,
workflow-route exclusions and bounded errors. They use local fixtures, not live
hosting telemetry. A negative routing case keeps generic Python files from
implying FastAPI while preserving explicit FastAPI selection.

The inventory records engineering evidence, not model-adherence scores. No live
AI-client comparison or automatic assertion of better designs, faster apps or
complete accessibility conformance follows from this review.
