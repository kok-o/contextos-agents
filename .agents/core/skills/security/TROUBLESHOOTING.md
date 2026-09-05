# security Troubleshooting & Common Mistakes

## 1. Insecure Direct Object References (IDOR)

- **Symptom**: User A can access User B's invoices by simply modifying the ID in the URL.
- **Root Cause**: Querying by record ID without scoping to the authenticated `user.id` or tenant ID.
- **Fix**: Always query with ownership predicate: `db.invoice.findFirst({ where: { id, userId: auth.user.id } })`.

## 2. SQL Injection via Raw String Concatenation

- **Symptom**: Database compromised through input fields.
- **Root Cause**: String templating in raw queries (`db.query("SELECT * FROM users WHERE id = " + id)`).
- **Fix**: Always use parameterized queries (`$1, $2`) or ORM/query-builder methods.

## 3. Storing Sensitive Secrets in Git or Client Bundles

- **Symptom**: API keys or JWT signing secrets exposed publicly.
- **Root Cause**: Hardcoding secrets in source files or prefixing server secrets with NEXT_PUBLIC_.
- **Fix**: Store all secrets in server-only environment variables; add git-secrets to pre-commit hooks.
