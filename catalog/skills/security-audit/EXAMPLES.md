# Bounded security review examples

## Existing-file containment

String prefixes are not directory boundaries: an allowed directory and a sibling
can share a prefix. Pass Node's fs and path modules as the final two arguments.
The original source block is exercised with real temporary files and outside
links in tests/skill-catalog-quality.test.js.

<!-- example: security-audit-contained-file -->
```javascript
export function resolveExistingFile(root, requested, fs, path) {
  if (typeof requested !== 'string' || !requested || path.isAbsolute(requested)) {
    throw new Error('An existing relative file path is required');
  }
  const base = fs.realpathSync(root);
  const target = fs.realpathSync(path.resolve(base, requested));
  const relative = path.relative(base, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('File resolves outside the allowed directory');
  }
  if (!fs.statSync(target).isFile()) throw new Error('Expected an existing file');
  return target;
}
```

This checks containment at that instant. It does not authorize access or provide
a race-free file-opening primitive. The caller authorizes the object and uses
the final decoded path consistently. Concurrent untrusted filesystem mutation
requires a suitable descriptor/capability-based or transactional boundary.
Missing files are rejected; do not adapt the example to writes by dropping the
check. Prefer the project's maintained safe filesystem layer.

## Finding scope

A focused download review records input, authorization, transformations, the
file operation and a bounded reproduction. Separate a confirmed defect from
unverified deployment assumptions. Reproduce with disposable files, not private
production data. Independent verification helps when available; changing role
labels in one model does not create an independent reviewer.
