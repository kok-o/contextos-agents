# adapters Examples — Anti-patterns vs ContextOS Standard

## Example 1: Multi-Agent Configuration

### Anti-pattern: Manually Syncing 6 Different Rule Files

```text
Editing .cursorrules, then forgetting to update CLAUDE.md, then editing copilot-instructions.md.
Rules diverge across teammates using different IDEs.
```

### Best practice: ContextOS Standard (Single Source of Truth)

```bash
# Edit skills once in .agents/core/skills/
# Compile to all agents with one command:
node .agents/ctx.js export all
# Automatically updates .cursorrules, CLAUDE.md, copilot-instructions.md, .aider, .zed
```
