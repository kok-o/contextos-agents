# Antigravity Native Plugin Integration & Marketplace Guide

ContextOS is packaged as a native plugin for **Google Antigravity IDE**, delivering deterministic context compilation, progressive skill disclosure, and automated session integrity hooks with zero runtime friction.

---

## 1. Overview

Antigravity discovers customizations by scanning root directories (`.agents/`, `~/.gemini/config/`). By packaging ContextOS into `.agents/plugins/contextos`, Antigravity automatically ingests:

- **39 Deterministic Skills** (UI/UX, System Design, Security, DDD, Microservices, Testing, Performance, etc.)
- **Session Lifecycle Hooks** (`PreInvocation`, `PostToolUse`)
- **MCP Tool Integration** (`contextos-mcp`)
- **Zero-Assumption Precision Rules** (`GEMINI.md`)

---

## 2. Directory Structure

The native plugin lives in `.agents/plugins/contextos/`:

```text
.agents/plugins/contextos/
├── plugin.json         # Plugin metadata and manifest
└── hooks.json          # Antigravity lifecycle event handlers
```

### Manifest (`plugin.json`)

```json
{
  "name": "contextos",
  "version": "1.7.1",
  "description": "Deterministic context compiler and policy engine for AI coding agents.",
  "author": {
    "name": "ContextOS Team",
    "url": "https://github.com/kok-o/contextos-agents"
  },
  "repository": "https://github.com/kok-o/contextos-agents",
  "license": "MIT",
  "keywords": [
    "contextos",
    "antigravity",
    "agent-skills",
    "orchestration",
    "gemini",
    "engineering-workflow"
  ]
}
```

### Lifecycle Hooks (`hooks.json`)

ContextOS hooks validate session health and prevent drift:

```json
{
  "contextos-session-guard": {
    "enabled": true,
    "PreInvocation": [
      {
        "type": "command",
        "command": "node .agents/ctx.js doctor"
      }
    ]
  },
  "contextos-integrity-check": {
    "enabled": true,
    "PostToolUse": [
      {
        "matcher": "run_command",
        "hooks": [
          {
            "type": "command",
            "command": "node .agents/ctx.js validate"
          }
        ]
      }
    ]
  }
}
```

---

## 3. Installation & Distribution

### One-Command CLI Installation

Install directly via the Antigravity CLI:

```bash
agy plugin install kok-o/contextos-agents
```

Or initialize into any repository using `npx`:

```bash
npx contextos-agents init --profile startup
```

### Workspace Registration

To explicitly register ContextOS in `.agents/plugins.json`:

```json
{
  "plugins": [
    {
      "name": "contextos",
      "path": ".agents/plugins/contextos"
    }
  ]
}
```

---

## 4. Verification & Diagnostics

To verify the plugin in your active workspace:

1. **List active plugins:**

   ```bash
   agy plugin list
   ```

2. **Run project diagnostic health check:**

   ```bash
   node .agents/ctx.js doctor
   ```

3. **Verify skill and manifest integrity:**

   ```bash
   node .agents/ctx.js validate
   ```

ContextOS will automatically enforce strict engineering workflows (`DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP`) and progressive token disclosure on every agent interaction.
