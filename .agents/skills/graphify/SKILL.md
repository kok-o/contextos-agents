---
name: graphify
description: >
  Codebase knowledge graph generator and architecture mapping guide. Instructs agents on AST dependency extraction and blast radius analysis.
---
# graphify

## Overview

**Graphify** is an instruction-only codebase mapping and context optimization guide. Instead of feeding raw directory trees or entire source files into an agent's context window, Graphify instructs agents on how to construct a deterministic, queryable knowledge graph (`graph.json`, `GRAPH_REPORT.md`, `graph.html`) using external companion analyzers (such as the TypeScript AST analyzer in `contextos-mcp` or the external `graphifyy` CLI), keeping the core package 100% zero-dependency without bundled native Tree-sitter binaries.

This skill instructs agents how to build, query, and maintain codebase graphs to navigate complex architectures with near-zero token overhead.

## When to Use

Activate whenever:

- Working in large repositories (10k+ LOC) where full-file reads cause context overflow.
- Performing cross-module refactorings and needing to determine exact dependency **blast radius**.
- Onboarding onto an unfamiliar codebase or mapping legacy service boundaries.
- The user asks to "map the codebase", "show dependency graph", "find central components", or "run graphify".
- Working alongside `context-manager` to supply an automated `PROJECT_GRAPH.md` / `graph.json`.

## Rules & Patterns

### 1. The Graph-First Navigation Protocol

Before opening and reading arbitrary source files in a large project:

1. **Check for Existing Artifacts**:
   - Inspect if `graph.json` or `GRAPH_REPORT.md` exists in the project root or `.graphify/`.
   - If present, query `graph.json` or read `GRAPH_REPORT.md` first to locate target modules.
2. **Deterministic CLI Execution**:
   - If missing or stale, generate the graph using the Python package (`pip install graphifyy`):

     ```bash
     graphify run .
     ```

   - For live development sessions, run in watch mode:

     ```bash
     graphify watch .
     ```

3. **Inspect God Nodes**:
   - Always check the "God Nodes" section of `GRAPH_REPORT.md`. These represent high-centrality modules (e.g., core configs, base models, central dispatchers). Changes to god nodes have the highest blast radius.

### 2. Context Safety Rules

- **Never load `graph.html` into agent context**: `graph.html` is an interactive visualization for humans in the browser; reading it burns tokens needlessly.
- **Selective JSON Querying**: Do not dump the entire `graph.json` into prompt context if it exceeds 50KB. Use targeted grep/jq queries to extract specific node neighbors.
- **Git Hygiene**: Add `graph.html` and `.graphify/cache` to `.gitignore`. Keep `GRAPH_REPORT.md` committed only if the team uses it as shared documentation.

### 3. Blast Radius Verification

When modifying a function, class, or interface:

1. Locate the symbol's node in `graph.json`.
2. Extract all inbound edges (`dependents` / `callers`).
3. Formulate the verification plan specifically around those dependent call sites.

---

## Code Examples

### Installing and Running Graphify

```bash
# Install graphify CLI (package name is graphifyy on PyPI)
pip install graphifyy

# Generate knowledge graph and markdown architectural report
graphify run ./src --output .graphify/

# View interactive visualization locally
open .graphify/graph.html
```

### Querying Node Dependencies via Shell

```bash
# Find dependents of a critical module in graph.json without loading entire file
node -e "
const g = require('./.graphify/graph.json');
const target = 'UserService';
const inbound = g.edges.filter(e => e.target === target).map(e => e.source);
console.log('Modules dependent on ' + target + ':', inbound);
"
```

### Git Pre-Commit Hook Integration

```bash
#!/bin/sh
# .git/hooks/pre-commit: ensure GRAPH_REPORT.md remains fresh
if command -v graphify >/dev/null 2>&1; then
  graphify run . --report-only
  git add GRAPH_REPORT.md
fi
```

---

## Validation Checklist

- [ ] `graph.json` and `GRAPH_REPORT.md` are generated without syntax errors.
- [ ] Central "God Nodes" are identified and accounted for in the implementation plan.
- [ ] No heavy visualization artifacts (`graph.html`, raw SVG dumps) are ingested into agent prompt context.
- [ ] Inbound dependencies (callers) are checked before modifying exported signatures.
- [ ] `.gitignore` properly excludes local graph caches and visualization outputs.

---

## Common Mistakes

- **Context Window Flooding**: Ingesting the complete `graph.json` of a 500k LOC repository into agent context instead of slicing target subgraphs.
- **Stale Graph Fallacy**: Assuming `graph.json` is up to date after heavy code refactorings without re-running `graphify run` or using `--watch`.
- **Ignoring Semantic Non-Code Files**: Neglecting SQL migrations, OpenAPI specs, and docker configs during graph extraction.
- **Mistaking Package Name**: Trying to install `pip install graphify` instead of the official PyPI package `graphifyy`.

---

## Integration Notes

- **Synergy with `context-manager`**: Graphify serves as the automated backend engine for `context-manager`. Instead of manually maintaining `docs/PROJECT_GRAPH.md`, run Graphify to keep `graph.json` current.
- **Synergy with `system-design`**: Use `GRAPH_REPORT.md` to ground architectural proposals in actual codebase topology.
- **Synergy with `architecture-diagrams`**: The nodes and edges extracted in `graph.json` can be directly mapped into animated SVG C4 architecture diagrams.


<!-- Source: EXAMPLES.md -->

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
