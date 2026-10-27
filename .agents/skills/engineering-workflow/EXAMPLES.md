# Workflow examples

## Routine change

Correct a README typo, inspect the diff, and run the relevant Markdown check.
A spec, role banner, synthetic unit test, or repeated approval adds no evidence.

## Feature slices

1. Create a minimal referral claim path through storage, service, API, and UI.
   Verify one valid claim and one rejected claim.
2. Add expiry and repeated-claim handling through the same path. Verify both.
3. Add the required abuse controls and relevant integration checks.

Do not split every feature into all storage first, all routes second, and all UI
last unless the architecture or dependencies actually require that order.

## Review request

Inspect the code and callers, reproduce a failure when feasible, report an
exploit or incorrect-result scenario and its scope. A review request by itself
is not a request to publish, message others, or rewrite the feature.

## Existing authority and unavailable checks

After the user authorizes a migration, verify its target, backup and relevant
data invariants, then carry out the agreed bounded work. A new plan is not a
reason to ask for the same permission again. If inspection reveals a different
database or a broader deletion, resolve that changed boundary first.

If an integration service is unavailable, run the local success/failure checks
that remain useful and identify the blocked integration case. Report the service
check as unrun; a passing fixture does not establish production behavior.
