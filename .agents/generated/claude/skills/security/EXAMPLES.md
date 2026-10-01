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
