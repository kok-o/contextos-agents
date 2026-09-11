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
