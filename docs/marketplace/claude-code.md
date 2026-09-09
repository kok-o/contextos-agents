# Claude Code Plugin & Marketplace Guide

ContextOS integrates natively with **Claude Code** (Anthropic CLI), compiling unified engineering guidelines, progressive skill disclosures, and MCP coordination tools into Claude's native conventions.

---

## 1. Overview & Architecture

Claude Code relies on project instructions (`CLAUDE.md`), custom slash commands, and Model Context Protocol (MCP) servers. ContextOS bridges seamlessly into Claude Code through:

- **`CLAUDE.md` Generator**: Compiles active profiles, roles, and engineering pipelines directly into Claude's primary instruction surface.
- **MCP Tool Execution**: Exposes worktree isolation, secret scrubbing, and multi-agent coordination tools via `contextos-mcp`.
- **Plugin Manifest Schema**: Conforms to standard Claude Code plugin definitions for one-step installation.

---

## 2. Plugin Configuration (`.claude/plugin.json`)

ContextOS provides a validated plugin configuration for Claude Code workspaces:

```json
{
  "$schema": "https://json.schemastore.org/claude-plugin.json",
  "name": "contextos",
  "version": "1.7.1",
  "description": "Deterministic AI Project Operating System context compiler, MCP runtime, and high-precision engineering skills for Claude Code.",
  "author": {
    "name": "ContextOS Team",
    "url": "https://github.com/kok-o/contextos-agents"
  },
  "homepage": "https://github.com/kok-o/contextos-agents",
  "commands": [
    {
      "name": "spec",
      "description": "Run Phase 1: DEFINE requirements and acceptance criteria"
    },
    {
      "name": "plan",
      "description": "Run Phase 2: PLAN architecture and atomic task breakdown"
    },
    {
      "name": "build",
      "description": "Run Phase 3: BUILD atomic implementation with TDD"
    },
    {
      "name": "test",
      "description": "Run Phase 4: VERIFY test coverage and regression checks"
    },
    {
      "name": "review",
      "description": "Run Phase 5: REVIEW code against engineering and design standards"
    },
    {
      "name": "ship",
      "description": "Run Phase 6: SHIP release checklist and documentation"
    },
    {
      "name": "doctor",
      "description": "Execute project diagnostic health check and stack detection"
    }
  ],
  "mcpServers": {
    "contextos": {
      "command": "npx",
      "args": ["-y", "contextos-mcp@0.3.1"]
    }
  }
}
```

---

## 3. Installation & Setup

### Quick Setup

Initialize ContextOS inside your repository:

```bash
npx contextos-agents init --profile startup
```

Compile native Claude Code instructions:

```bash
node .agents/ctx.js export claude
```

This generates an optimized, token-efficient `CLAUDE.md` at the project root and populates `.agents/generated/claude/skills/`.

### Register MCP Server with Claude Code

Connect the isolated subagent coordination server:

```bash
claude mcp add contextos -- npx -y contextos-mcp
```

Or verify active MCP servers:

```bash
claude mcp list
```

---

## 4. Verification & Health Check

1. **Verify Plugin and Skills Integrity:**

   ```bash
   node .agents/ctx.js validate
   ```

2. **Verify Project Health:**

   ```bash
   node .agents/ctx.js doctor
   ```

3. **Verify Context Compression:**

   ```bash
   node .agents/ctx.js stats
   ```

Claude Code will automatically adhere to the ContextOS 6-phase engineering pipeline with token-efficient progressive skill loading.
