# Minimal maintainable implementation

## Decision ladder

1. Does this solve the requested outcome? Avoid speculative features.
2. Does project code or the installed component system already handle it?
3. Does the standard library provide the operation?
4. Does the native platform meet the actual requirements?
5. Can an installed dependency handle it without extra integration cost?
6. Can it be a readable one-liner without hiding boundary checks?
7. Otherwise write the smallest clear implementation.

The rule of three is a duplication heuristic, not a ban on named functions.
Extract a single-use helper when it clarifies an invariant or isolates an I/O
boundary. Prefer the project's established UI system; do not install shadcn or
another library merely because a generic guide names it. dayjs is a dependency,
not a standard-library API. Verify retry/circuit-breaker support in the actual
SDK; do not assume native fetch supplies an application retry policy.

## Preserve boundary validation

This runnable example defines a protected update operation around a supplied
persistence function. The caller must obtain the session through trusted
server-side authentication. The sample schema covers only name/email; adapt it
to the real product schema, error contracts, and tenant model.

<!-- example: ponytail-update -->
```javascript
export function createUserUpdater(update) {
  if (typeof update !== 'function') throw new TypeError('Persistence function required');
  return async function updateUser(id, data, session) {
    if (typeof id !== 'string' || !id || session?.userId !== id) {
      throw new Error('Forbidden');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('Invalid update payload');
    }
    const keys = Object.keys(data);
    if (!keys.length || keys.some(key => !['name', 'email'].includes(key))) {
      throw new TypeError('Unknown or empty update fields');
    }
    const parsed = {};
    if (Object.hasOwn(data, 'name')) {
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100) {
        throw new TypeError('Invalid name');
      }
      parsed.name = data.name;
    }
    if (Object.hasOwn(data, 'email')) {
      if (typeof data.email !== 'string' || data.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        throw new TypeError('Invalid email');
      }
      parsed.email = data.email;
    }
    return update({ where: { id }, data: parsed });
  };
}
```

The verifier runs this block with an injected persistence function and asserts
that denied users, invalid emails, and unknown privilege fields never reach it.
This is boundary evidence, not proof of a live database or authentication setup.

## Verification checklist

- Each dependency or abstraction solves an inspected requirement.
- Protected inputs and operations retain their checks.
- Errors have a meaningful contract; avoid redundant catch/log/rethrow layers.
- Behavior checks cover relevant success and failure cases.
