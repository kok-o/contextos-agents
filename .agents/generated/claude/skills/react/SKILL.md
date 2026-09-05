# React Engineering & Performance Best Practices

## Overview

Enforces declarative, component-driven UI architecture with optimal re-render cycles, state colocation, responsive optimistic updates, and robust accessibility standards.

## When to Use

Activate whenever creating, refactoring, or optimizing React functional components, custom hooks, context providers, or UI interaction states.

## Negative Constraints (What NOT to Do)

1. **NEVER use `useEffect` to synchronize or compute derived state**: Calculate derived state inline during render. Use `useMemo` only for computationally intensive derivations.
2. **NEVER use array indices as `key` props on dynamic or reorderable lists**: Always use stable, unique entity identifiers (`item.id`).
3. **NEVER mutate React state directly**: Always return new immutable references (`[...prev, newItem]` or `{ ...prev, key: value }`).
4. **NEVER declare subcomponents inside the render body of parent components**: Declare components at module scope or in dedicated files to prevent DOM node remounting and lost focus state.
5. **NEVER create memory leaks in `useEffect`**: Always provide clean-up functions for event listeners, `AbortController`, timers, and websocket subscriptions.
6. **NEVER lift state higher than necessary**: Colocate state to the nearest common ancestor or leaf component to prevent wasteful re-renders of unrelated subtrees.

## Rules & Patterns

### 1. State Colocation & Re-render Optimization

- **State Colocation**: Keep state as close as possible to the components that consume it.
- **Composition to Prevent Re-renders**: Pass expensive static subtrees as `children` to wrapper components holding state so the children do not re-render when the wrapper updates.

```tsx
export function ExpandableCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border p-4">
      <button 
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="flex w-full justify-between font-semibold"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="mt-3 pt-3 border-t">{children}</div>}
    </div>
  );
}
```

### 2. Optimistic UI Updates & Concurrent Actions (`useOptimistic`, `useTransition`)

- Provide instantaneous visual feedback for user actions without waiting for server network roundtrips.

```tsx
import { useOptimistic, useTransition } from 'react';

export function TodoList({ todos, onAdd }: { todos: Todo[]; onAdd: (text: string) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newText: string) => [...state, { id: 'temp-' + Date.now(), text: newText, isPending: true }]
  );

  const handleAction = async (formData: FormData) => {
    const text = formData.get('todo') as string;
    if (!text?.trim()) return;

    startTransition(async () => {
      addOptimisticTodo(text);
      await onAdd(text);
    });
  };

  return (
    <form action={handleAction} className="space-y-4">
      <input name="todo" placeholder="Add a new task..." className="border p-2 rounded" />
      <button type="submit" disabled={isPending} className="bg-primary text-white px-4 py-2 rounded">
        {isPending ? 'Saving...' : 'Add'}
      </button>
      <ul className="divide-y">
        {optimisticTodos.map(todo => (
          <li key={todo.id} className={todo.isPending ? 'opacity-50 italic' : ''}>
            {todo.text}
          </li>
        ))}
      </ul>
    </form>
  );
}
```

### 3. Derived State vs. Effects Anti-Pattern

```tsx
// [GOOD] Computed directly during render (or memoized if expensive)
function SearchResults({ query, items }: { query: string; items: Item[] }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.title.toLowerCase().includes(q));
  }, [query, items]);

  return <List items={filtered} />;
}
```

## Code Examples

See `EXAMPLES.md` for detailed code examples and hook implementations.

## Validation Checklist

- [ ] Zero `useEffect` hooks used for derived calculations.
- [ ] Every list mapping has a unique, non-index entity ID key.
- [ ] Subcomponents declared in parent render functions are extracted to top-level scope.
- [ ] Effects with event listeners, timers, or abortable requests include clean-up returns.
- [ ] Reusable components are composed cleanly via `children` or render props.

## Common Mistakes

- Setting state inside `useEffect` based on prop changes rather than deriving values inline.
- Declaring nested components within component bodies.
- Using index keys causing input focus loss or animations breaking on list mutations.

## Integration Notes

- Pairs with `typescript` for type safety on props, generics, and ref forwarding.
- Pairs with `ui-ux-pro` and `web-accessibility` for UI tokens and ARIA standards.


# React Examples — Anti-patterns vs ContextOS Standard

## Example 1: Derived State vs. useEffect

### Anti-pattern: Anti-pattern (Redundant state + extra render with useEffect)

```tsx
// BAD: causes an unnecessary extra render cycle and potential state desync
function OrderSummary({ items }: { items: CartItem[] }) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const calculated = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    setTotal(calculated);
  }, [items]);

  return <div>Total: ${total}</div>;
}
```

### Best practice: ContextOS Standard (Inline derived calculation / useMemo)

```tsx
// GOOD: calculated instantly during render with zero extra render pass
function OrderSummary({ items }: { items: CartItem[] }) {
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  return <div>Total: ${total.toFixed(2)}</div>;
}
```

---

## Example 2: Custom Hook Encapsulation

### Anti-pattern: Anti-pattern (Scattered listener logic inside component)

```tsx
// BAD: window listener logic cluttering UI component
function NavHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return <header className={isScrolled ? 'scrolled' : ''}>Header</header>;
}
```

### Best practice: ContextOS Standard (Reusable Custom Hook)

```tsx
// GOOD: extracted into a reusable, testable custom hook
export function useScrollThreshold(threshold = 50): boolean {
  const [isPassed, setIsPassed] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsPassed(window.scrollY > threshold);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return isPassed;
}
```

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