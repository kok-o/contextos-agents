# Graphify Examples — Anti-patterns vs ContextOS Standard

## Example 1: Codebase Exploration & Architecture Mapping

### Anti-pattern: Context Window Flooding (Dumping source directories into prompt)

```bash
# BAD: Reading 150 TypeScript files into context to understand system architecture.
# Burns 200k+ tokens, causes model hallucinations, and loses attention span.
cat src/**/*.ts | llm "explain the architecture and component connections"
```

### Best practice: ContextOS Standard (Deterministic Tree-sitter AST Graph)

```bash
# GOOD: Generate queryable AST knowledge graph and compact architecture summary
graphify run ./src --output .graphify/

# Inspect high-level architecture and god nodes with minimal tokens (<2k tokens)
cat .graphify/GRAPH_REPORT.md
```

---

## Example 2: Refactoring Blast-Radius Analysis

### Anti-pattern: String Grep Guesswork

```bash
# BAD: Grepping for common symbol names returns hundreds of false positives (comments, logs, unrelated types)
grep -rn "PaymentService" src/
```

### Best practice: ContextOS Standard (Inbound Dependency Traversal via graph.json)

```javascript
// GOOD: Precise AST-level callers extracted directly from knowledge graph edges
const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('.graphify/graph.json', 'utf8'));

const targetNode = 'PaymentService';
const dependents = graph.edges
  .filter(edge => edge.target === targetNode && edge.type === 'imports')
  .map(edge => edge.source);

console.log(`Modules directly broken by modifying ${targetNode}:`, dependents);
```

---

## Example 3: Keeping Graph Fresh in CI / Pre-commit

### Anti-pattern: Relying on Outdated Graphs

```bash
# BAD: Developing against a graph generated two months ago.
# Dependencies drift, leading to false safety assumptions.
```

### Best practice: ContextOS Standard (Git Hook & Automated Watch)

```bash
# Option A: Active development in watch mode
graphify watch ./src --output .graphify/

# Option B: Pre-commit hook to verify fresh GRAPH_REPORT.md
#!/bin/sh
# .git/hooks/pre-commit
if command -v graphify >/dev/null 2>&1; then
  graphify run ./src --report-only
  git add GRAPH_REPORT.md
fi
```
