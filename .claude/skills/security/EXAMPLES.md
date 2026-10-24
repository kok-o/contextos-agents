# Security boundary examples

## Protected document mutation

Illustrative integration sketch: authenticate through trusted middleware, check
the tenant role permits the action, and scope the query by document ID and trusted
tenant ID. Return the established denied/missing response when no accessible
document matches. Tenant membership alone may not permit deletion.

Do not report a working endpoint from a sketch with assumed ORM/middleware.
Verify another user's or tenant's document is inaccessible before persistence.

## Executable controls

The original runnable HMAC and partner-fetch blocks are in [SKILL.md](SKILL.md).
The verifier extracts these blocks rather than manually maintained copies.
Checks cover signatures and URL scheme, credentials, host, port, transport, and
redirect policy. Egress, DNS, and replay defenses need separate integration tests.

## Source-checkout scanner

```powershell
node bin/index.js scan --staged --enforce --placeholders
```

This checks staged secrets and placeholders. Supply --scope <file> with the
actual scope JSON for write boundaries. Inspect unstaged changes separately.
An empty index does not prove a candidate contains no unsafe code.
