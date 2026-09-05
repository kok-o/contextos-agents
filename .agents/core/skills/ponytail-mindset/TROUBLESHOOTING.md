# ponytail-mindset Troubleshooting & Common Mistakes

## 1. Conflating Minimalism with Cutting Safety Guards

- **Symptom**: Agent removes input validation, error handling, or security checks in the name of "less code".
- **Root Cause**: Misunderstanding the Ponytail principle. Ponytail cuts unnecessary abstractions, never safety invariants.
- **Fix**: Invariant: Always retain 100% of input sanitization, error boundaries, and type safety checks.

## 2. "Just In Case" Speculative Coding (YAGNI Violation)

- **Symptom**: Adding config options, generics, and plugin interfaces for features not requested.
- **Root Cause**: Premature future-proofing.
- **Fix**: Apply Rung 1 of the ladder: If it doesn't solve the immediate requirement, do not write it.

## 3. Reinventing Installed Dependencies

- **Symptom**: Writing a deep-clone helper when Lodash or native structuredClone is available.
- **Root Cause**: Skipping inspection of package.json and runtime environment.
- **Fix**: Inspect installed dependencies before writing utility functions.
