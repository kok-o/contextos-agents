# ContextOS — Application Security

# security

## Overview

Enforces zero-trust defense-in-depth, OWASP API Top 10 mitigation, cryptographic hardening, sensitive data leakage protection, and AI/LLM safety across all services, endpoints, and agent integrations.

## When to Use

Activate whenever writing authentication, authorization, session management, database queries, cryptography, external API integrations, user input handling, or agent tool calling.

## Rules & Patterns

### Negative Constraints (What NOT to Do)

1. **NEVER use standard string comparison (`===`) for secrets/hashes**: Always use `crypto.timingSafeEqual` to prevent timing attacks.
2. **NEVER store sensitive JWT access/refresh tokens in `localStorage`**: Store tokens in `httpOnly`, `Secure`, `SameSite=Strict` cookies.
3. **NEVER return raw database/internal error messages or stack traces to the client**: Return standardized generic error codes (`INTERNAL_SERVER_ERROR`) and log details internally.
4. **NEVER trust client-provided IDs for authorization without tenant/ownership checks**: Always verify `where: { id, userId: session.userId }` to prevent Broken Object Level Authorization (BOLA/IDOR).
5. **NEVER disable CSRF protection, CORS allow-all (`*`), or TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED=0`) in production**: Always enforce strict origin whitelists and HTTPS.
6. **NEVER pass un-sanitized third-party content directly into system prompts or shell execution**: Treat all external data as potentially adversarial.

---

### OWASP Top 10 for Modern APIs & Full-Stack

#### 1. Injection (SQL, NoSQL, Command)

- Always use parameterized queries — never concatenate user input into SQL or shell commands.
- Use ORMs (Prisma, Drizzle, SQLAlchemy) with strict schema validation.
- Validate and sanitize all user input before processing.

#### 2. Broken Object Level Authorization (BOLA / IDOR)

- Validate user ownership on EVERY database read, update, or delete:

  ```typescript
  // [GOOD] Scoped to authenticated user
  const doc = await db.document.findFirst({
    where: { id: documentId, tenantId: session.tenantId }
  });
  ```

#### 3. Broken Authentication & Session Management

- Use Argon2id or bcrypt (cost factor ≥ 12) for password hashing.
- Short-lived access tokens (15 min) + secure HTTP-only refresh tokens.
- Enforce rate limiting and brute-force lockouts on auth endpoints.

#### 4. SSRF (Server-Side Request Forgery)

- Restrict server-side URL fetching: validate URL scheme (`https:` only), resolve IP, and block private CIDR blocks (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `192.168.0.0/16`).

#### 5. Security Misconfiguration & Headers

Enforce modern production security headers:

```http
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

### AI Agent & LLM Security Invariants

When building AI workflows, tools, or MCP servers:

1. **Prompt Injection Defense**:
   - Clearly delineate untrusted user/web content using boundary markers (e.g. `<untrusted_content>` tags).
   - Never allow untrusted content to override system instructions or tool execution permissions.
2. **Tool Execution Boundaries**:
   - Destructive operations (database drops, file deletions, payment triggers) MUST require explicit user confirmation.
   - Restrict file system tools to the workspace root — block directory traversal (`../`).
3. **Secret Masking & Output Sanitization**:
   - Scrub API keys (`sk-...`, `Bearer ...`), tokens, and credentials before writing to agent logs or step summaries.

---

## Code Examples

### Timing-Safe Secret Verification

```javascript
import crypto from 'node:crypto';

export function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = Buffer.from(hmac.update(payload).digest('hex'), 'utf8');
  const sigBuffer = Buffer.from(signature, 'utf8');

  if (digest.length !== sigBuffer.length) return false;
  return crypto.timingSafeEqual(digest, sigBuffer);
}
```

### Safe SSRF Prevention Wrapper

```typescript
import dns from 'node:dns/promises';

export async function validateSafeUrl(urlString: string): Promise<URL> {
  const parsed = new URL(urlString);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS protocol is permitted');
  }

  const { address } = await dns.lookup(parsed.hostname);
  if (
    address.startsWith('127.') ||
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    address === '169.254.169.254'
  ) {
    throw new Error('Access to private/metadata IP addresses is blocked');
  }

  return parsed;
}
```

---

## Validation Checklist

- [ ] All database queries parameterized or managed by type-safe ORM.
- [ ] BOLA/IDOR prevented: all entity queries scoped by tenant/user id.
- [ ] Cookies set with `HttpOnly`, `Secure`, and `SameSite=Strict` or `Lax`.
- [ ] Passwords hashed with Argon2id / bcrypt.
- [ ] Security headers active in middleware/reverse proxy.
- [ ] No secrets or tokens checked into source control or exposed in logs.

---

## Common Mistakes

- **Trusting client-side claims**: Checking role or permissions only on the frontend without server-side validation.
- **Timing attacks on tokens**: Comparing tokens with `token === expectedToken` instead of `timingSafeEqual`.
- **Exposing internal stack traces**: Returning full error objects to client in production.
- **Unvalidated redirects / URLs**: Allowing arbitrary URLs in redirect or fetch parameters.

---

## Integration Notes

- Runs in the REVIEW phase for every backend route, auth flow, and database mutation.
- Integrates with `engineering-workflow` during Phase 5 (5-axis quality gate).
- Pairs with `system-design` to mandate secure network boundaries and authorization layers.


# Application Security Examples — Anti-patterns vs ContextOS Standard

## Example 1: Timing-Safe Secret Verification

### Anti-pattern: Anti-pattern (Vulnerable to side-channel timing attack)

```typescript
// BAD: string comparison returns early on the first mismatched byte
export function verifyApiKey(providedKey: string, storedKey: string): boolean {
  return providedKey === storedKey; // Vulnerable to timing analysis!
}
```

### Best practice: ContextOS Standard (Constant-time buffer comparison)

```typescript
// GOOD: crypto.timingSafeEqual executes in constant time
import crypto from 'crypto';

export function verifyApiKey(providedKey: string, storedKey: string): boolean {
  const providedBuffer = Buffer.from(providedKey, 'utf8');
  const storedBuffer = Buffer.from(storedKey, 'utf8');

  if (providedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, storedBuffer);
}
```

---

## Example 2: Preventing IDOR (Insecure Direct Object Reference)

### Anti-pattern: Anti-pattern (Trusting client ID without ownership check)

```typescript
// BAD: any authenticated user can delete any other user's document!
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
```

### Best practice: ContextOS Standard (Multi-tenant scoped authorization check)

```typescript
// GOOD: document deletion is strictly scoped to authenticated user or org
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  const deleted = await prisma.document.deleteMany({
    where: {
      id: req.params.id,
      organizationId: req.user.organizationId, // Tenant isolation
    },
  });

  if (deleted.count === 0) {
    return res.status(404).json({ error: 'Document not found or access denied' });
  }

  return res.status(204).end();
});
```
