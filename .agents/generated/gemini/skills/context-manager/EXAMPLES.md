# context-manager Examples — Anti-patterns vs ContextOS Standard

## Example 1: Context Selection

### Anti-pattern: Context Window Dumping

```text
Agent reads all 180 files in src/ into context to debug a single button click handler.
Result: Exhausts 150k tokens, reaches rate limits, and forgets user instructions.
```

### Best practice: ContextOS Standard (Targeted AST Traversal)

```text
1. Inspect package.json and AGENTS.md.
2. Grep for target symbol: grep_search for 'SubmitButton'.
3. Read ONLY components/SubmitButton.tsx and its direct import types/button.ts.
Total tokens used: <1,500 tokens. Fast, accurate, zero hallucinations.
```
