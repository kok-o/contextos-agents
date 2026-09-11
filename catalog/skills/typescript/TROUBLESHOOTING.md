# typescript Troubleshooting & Common Mistakes

## 1. Excessive Use of `any` or `as unknown as T`

- **Symptom**: Runtime `TypeError: Cannot read properties of undefined` in supposedly typed TypeScript code.
- **Root Cause**: Bypassing type checking with `any` or forceful type assertions.
- **Fix**: Use `unknown` with type guards, Zod schemas, or discriminated unions.

## 2. Non-Exhaustive Switch on Unions

- **Symptom**: New union member added but some switch statements fail to handle it, producing bugs.
- **Root Cause**: Missing exhaustive type checking in `default:` case.
- **Fix**: Add `default: const _exhaustive: never = action; throw new Error(_exhaustive);` to let the compiler catch missing branches.

## 3. Inaccurate Generics Constraints

- **Symptom**: Generic functions that lose type inference and resolve to `unknown`.
- **Root Cause**: Over-specifying generics or missing `extends` constraints.
- **Fix**: Constrain generics narrowly: `function get<T, K extends keyof T>(obj: T, key: K): T[K]`.
