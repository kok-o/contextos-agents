# Proportional engineering workflow

## Choose checks by risk

| Work | Process | Evidence |
| --- | --- | --- |
| Routine docs, formatting, low-risk config | Inspect, edit, targeted verification | Relevant formatter, validator, or smoke check |
| Feature or bugfix | Short plan, implement, behavior checks, self-review | Changed behavior and callers, relevant integration tests |
| Auth, payments, migrations, concurrency | Acceptance criteria, plan, bounded change, regression checks, review | Allowed and denied cases, failure paths, relevant project gates |
| Destructive operation | Confirm existing authority and bounds, backup/rollback, guarded action, verify | State before/after and recovery evidence |

Risk classification is a routing aid. Inspect the actual operation; do not treat
an inferred low-risk label as authorization or permission to remove safety checks.

## Define and plan

For substantial changes record the outcome, in-scope work, acceptance cases,
affected code/callers, dependencies, and relevant verification. Resolve only
missing material decisions. Keep user authorization across phases; do not stop
again merely because a spec or plan now exists.

Prefer independently useful vertical slices when possible. For a referral
feature, start with one minimal service/API/UI path, verify it, then add expiry
and abuse controls. Infrastructure-only work can have infrastructure-only steps.
Update the plan when an inspected caller must change within the authorized scope.

## Implement and verify

Read before editing. Preserve unrelated work. Use a failing regression test first
when it clearly captures a bug or logic change; TDD is a technique, not a required
ceremony for every file. Docs/config may need a validator or smoke run instead.
Do not add tests that merely repeat implementation or count strings as behavior.
Do not claim a real integration is implemented using a stub. Commit only when
requested or required by the repository workflow; an atomic slice does not
itself require a commit.

Run relevant checks, examine failures, and repair introduced regressions. State
pre-existing failures, unavailable environments, and unrun checks separately.
Do not silently expand the feature or remove a check to obtain a green result.

## Review and simplify

Compare the diff to acceptance criteria, callers, and applicable security and
performance boundaries. Prefer readable code and existing facilities. A helper
used once is acceptable when it names a concept, isolates a boundary, or makes
verification clearer. Reuse counts alone do not determine good abstractions.
Role changes within one model are self-review, not independent peer review.

## Prepare delivery

Update relevant documentation and migration/rollback instructions. Publishing,
deployment, destructive actions, and external messages require authorization for
that action unless it is already present. Preparation does not prove deployment.
Durable project learnings can be recorded when authorized; do not add a required
learning statement or unrelated memory edits to every completion.

## Report evidence

Name what changed, why, commands/results, tested scope, and remaining limitations.
VALIDATION.json describes an evidence-report format, not proof that these rules
were followed. Structural validation, example tests, and live client behavior
are different evidence scopes.

For this source checkout:

```powershell
node .agents/ctx.js validate
node bin/index.js scan --staged --enforce --placeholders
```

The first command checks skill sources and sync. The second checks staged secrets
and placeholders. Add --scope <file> only with an actual scope JSON file; an empty
index does not verify unstaged edits. For a consumer installation use its local
ContextOS executable rather than assuming these source paths exist.
