# react Troubleshooting & Common Mistakes

## 1. Infinite Render Loops in useEffect

- **Symptom**: Browser freezes, "Maximum update depth exceeded" error.
- **Root Cause**: Creating new object or array literals inside component body and passing them to useEffect dependency array.
- **Fix**: Colocate state, compute derived state during render without useEffect, or use primitive dependency values.

## 2. Stale Closures in Callbacks

- **Symptom**: Event handler or setTimeout accesses outdated state values.
- **Root Cause**: Callback closing over initial state without updated dependency.
- **Fix**: Use functional state updates (`setCount(c => c + 1)`) or `useRef` for mutable references.

## 3. Prop Drilling vs Context Performance

- **Symptom**: Changing a small state variable causes the entire component tree to re-render.
- **Root Cause**: Storing rapidly changing state in a single monolithic React Context.
- **Fix**: Split contexts by domain or migrate client UI state to Zustand with granular selectors.
