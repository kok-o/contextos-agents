# ui-design Examples — Anti-patterns vs ContextOS Standard

## Example 1: Component Token Consistency

### Anti-pattern: Hardcoded Arbitrary Tailwind Utilities

```tsx
// BAD: Inconsistent spacing, arbitrary colors, unmaintainable styling
<div className="p-[13px] bg-[#1a1b2e] rounded-[7px] text-[#99aab5] border border-[#2b2d42]">
  <button className="px-[15px] py-[7px] bg-[#5865f2] hover:bg-[#4752c4]">Action</button>
</div>
```

### Best practice: ContextOS Standard (Semantic Theme Tokens)

```tsx
// GOOD: Consistent scale utilities driven by Tailwind v4 @theme design tokens
<div className="p-4 bg-card rounded-lg text-muted-foreground border border-border">
  <Button variant="primary" size="md">Action</Button>
</div>
```
