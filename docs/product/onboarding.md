# ContextOS Quickstart: 5-Minute Developer Onboarding

ContextOS compiles deterministic engineering rules, architectural policies, and specialist skills directly into native context instructions for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Gemini CLI, Aider, and Zed).

Follow this 5-minute guide to equip your repository with version-controlled context governance.

---

## 1. Quick Initialization (30 Seconds)

Inside your project root, run the initialization command:

```sh
# Automatic stack detection and recommended profile setup
npx contextos-agents init --auto
```

### Alternative Installation Modes

- **Minimal core only** (essential workflows without tech-specific catalog skills):
  ```sh
  npx contextos-agents init --minimal
  ```
- **Targeted editor setup** (e.g. Cursor only):
  ```sh
  npx contextos-agents init --agent cursor
  ```
- **Dry-run simulation** (inspect proposed file tree without writing to disk):
  ```sh
  npx contextos-agents init --dry-run
  ```

---

## 2. Structure of Your Project Context

After running `init`, ContextOS creates an isolated `.agents/` directory in your project root:

```text
.agents/
  core/
    skills/
      engineering-workflow/   # Standard development lifecycle: Spec -> Plan -> Build -> Test -> Review -> Ship
      ponytail-mindset/       # Minimalist 7-rung coding discipline (YAGNI, platform-first)
      security/               # Mandatory application security and sanitization checks
  AGENTS.md                   # Single source of truth for AI agents
  contextos.lock.json         # Version-controlled lockfile tracking managed projections
```

> **Safety Guarantee**: ContextOS never touches your business source code. All generated adapter outputs are cleanly compartmentalized.

---

## 3. Creating Your First Custom Rule

You can add repository-specific engineering standards anytime:

1. Create a directory under `.agents/core/skills/<skill-name>/`:
   ```sh
   mkdir -p .agents/core/skills/team-conventions
   ```

2. Add a `SKILL.md` file with metadata frontmatter:
   ```markdown
   ---
   name: team-conventions
   description: Team coding conventions, error handling, and API guidelines
   ---
   # Team Engineering Conventions

   - All API endpoints must return standardized JSON payloads: `{ "ok": true, "data": ... }`.
   - Never expose internal database IDs in public API responses.
   - Use structured logging instead of console.log.
   ```

---

## 4. Exporting to AI Assistants

Compile your single-source rules into your team's active editor environments:

```sh
# Export to all supported editors simultaneously
npx contextos-agents export all

# Or export to specific tools:
npx contextos-agents export cursor
npx contextos-agents export claude
npx contextos-agents export copilot
npx contextos-agents export aider
npx contextos-agents export zed
npx contextos-agents export gemini
```

### What Gets Created

- **Cursor**: `.cursor/rules/*.mdc` (rich glob-scoped rules)
- **Claude Code**: `CLAUDE.md` (preserved user instructions + synchronized ContextOS imports)
- **GitHub Copilot**: `.github/copilot-instructions.md`
- **Aider**: `.aider.conf.yml` (non-destructively merged read-only conventions)
- **Zed**: `.zed/rules.md`

Existing user configurations and custom rules are preserved with zero data loss.

---

## 5. Local Quality Gate Verification

Before committing code or opening a PR, ensure that generated editor rules are completely synchronized with your `.agents/` source rules:

```sh
# Fast in-process drift verification
npx contextos-agents gate
```

- Returns **code 0** (`PASS`): All managed projections match source specifications.
- Returns **code 1** (`DRIFT`): Detected modified, deleted, or out-of-sync output files. Run `npx contextos-agents export all` to re-synchronize.
- Returns **code 2** (`TOOL_ERROR`): Corrupted or unparseable project configuration.

---

## 6. Continuous Integration (GitHub Actions)

Add the isolated ContextOS Quality Gate to your repository CI workflow to automatically reject out-of-sync context in pull requests.

Create `.github/workflows/contextos-gate.yml`:

```yaml
name: ContextOS Quality Gate

on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

jobs:
  verify-context:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Verify ContextOS Projections
        uses: kok-o/contextos-agents/.github/actions/contextos-gate@v2.1.0-rc.1
        with:
          version: '2.1.0-rc.1'
          target: 'all'
```

The composite Action runs completely isolated from consumer code: it never invokes `npm ci`, never runs consumer shell scripts, and never executes untrusted code from PR forks.

---

## 7. Updates and Recovery

- **Updating skills safely**:
  ```sh
  npx contextos-agents update
  ```
  Updates core definitions without overwriting or deleting your custom team skills.

- **Checking project health**:
  ```sh
  npx contextos-agents doctor
  ```

- **Recovering from interrupted operations**:
  ```sh
  npx contextos-agents recover --list
  npx contextos-agents recover --rollback <txId>
  ```
