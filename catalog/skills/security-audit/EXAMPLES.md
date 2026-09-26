# Security Audit - Examples & Verification Scenarios

## Example 1: Adversarial Validation of Path Traversal

### Hunter Report (Initial Finding)
```markdown
ID: CANDIDATE-01
Component: User Avatar Download
Location: src/routes/avatar.ts:18
Sink: fs.createReadStream(path.join(__dirname, '../../uploads', req.query.file))
Hypothesis: Attacker passes `?file=../../etc/passwd` to read arbitrary host files.
```

### Verifier Execution (Disproving Attempt)
The verifier inspects the middleware chain and creates an isolated reproduction test:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

function resolveAvatarPath(baseDir: string, requestedFile: string): string {
  const safePath = path.resolve(baseDir, requestedFile);
  if (!safePath.startsWith(baseDir)) {
    throw new Error('Access denied: directory traversal detected');
  }
  return safePath;
}

describe('Avatar Path Resolution', () => {
  const uploadsDir = path.resolve('/var/app/uploads');

  it('rejects traversal attempts escaping uploads root', () => {
    assert.throws(
      () => resolveAvatarPath(uploadsDir, '../../etc/passwd'),
      /Access denied: directory traversal detected/
    );
  });

  it('allows safe filenames inside uploads root', () => {
    const resolved = resolveAvatarPath(uploadsDir, 'user-123.png');
    assert.equal(resolved, path.join(uploadsDir, 'user-123.png'));
  });
});
```

### Verifier Verdict
- If `resolveAvatarPath` was missing in source: Finding is **CONFIRMED** with source trace.
- If middleware sanitized input before the handler: Finding is **DISPROVEN** and logged as invalid candidate with reason.

---

## Example 2: Minimal Remediated Code Block

```typescript
// Vulnerable:
// app.get('/files', (req, res) => {
//   res.sendFile(path.join(PUBLIC_DIR, req.query.path as string));
// });

// Remediated (Surgical Blast Radius):
import path from 'node:path';

app.get('/files', (req, res) => {
  const rawPath = String(req.query.path ?? '');
  const normalizedPath = path.normalize(rawPath).replace(/^(\.\.[\/\\])+/, '');
  const resolved = path.resolve(PUBLIC_DIR, normalizedPath);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Path traversal attempted'
      }
    });
  }

  res.sendFile(resolved);
});
```
