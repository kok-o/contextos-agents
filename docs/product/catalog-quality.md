# ContextOS skill verification scope

Updated 4 October 2026. This gate verifies declared local scenarios; it does not
certify the entire catalog or guarantee that an AI client follows instructions.

## Coverage

All seven core skills are included: `engineering-workflow`, `ponytail-mindset`,
`security`, `gemini-precision`, `context-os`, `context-manager`, and `gstack-roles`.
Executable core blocks must have a registered scenario that loads their original
Markdown source. Unregistered executable blocks fail the gate.

Catalog coverage includes four of the 36 skills: `fastapi`, `web-accessibility`,
`adapters`, and `typescript`. The other 32 have manifest/structural validation,
without equivalent example verification. Passing `validate --catalog` does not
change that boundary.

The current inventory contains 21 blocks: 14 runnable and seven illustrative.
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

## Reproduce

```sh
node scripts/verify-skill-examples.js
node scripts/verify-skill-examples.js --json
node --test tests/skill-examples.test.js tests/core-skill-standard.test.js
node .agents/ctx.js validate --catalog
```

JSON is the authority for counts after source changes. Every additional catalog
skill needs an explicit scope and meaningful scenarios before its behavior can
be described as verified. Type checking, live clients, browser accessibility and
application execution require their own evidence.
