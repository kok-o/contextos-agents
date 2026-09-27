# ContextOS Adapter Compatibility Matrix & Technical Contracts

This document establishes the authoritative technical contracts, entrypoints, scoping mechanisms, and verification statuses for all AI assistant adapters supported by ContextOS v2.0.

---

## 1. Supported Adapters & Contract Overview

| Adapter | Product Target | Primary Entrypoint | Generated Output Files | Scoping Mechanism | Custom User Content Preservation | Verification Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Cursor** | Cursor 0.45+ | `.cursor/rules/*.mdc` | `.cursor/rules/*.mdc`, legacy `.cursorrules` | MDC frontmatter (`globs`, `alwaysApply`) | Managed frontmatter block; `.cursorrules` preserves user header | Verified in tests |
| **Claude Code** | Claude Code CLI 0.2+ | `CLAUDE.md` | `CLAUDE.md`, `.agents/generated/claude/skills/**/SKILL.md` | Top-level memory index referencing modular skills | Managed provenance block with preserved user sections | Verified in tests |
| **Gemini CLI** | Gemini CLI & Flash 3.8 | `GEMINI.md` | `GEMINI.md`, `.agents/skills/**/SKILL.md`, `.agents/generated/gemini/**` | Context inclusion and hierarchical rule imports | Preserved user rules block | Verified in tests |
| **GitHub Copilot** | Copilot Chat & Agent | `.github/copilot-instructions.md` | `.github/copilot-instructions.md` | Modular instructions (`.github/instructions/` with `applyTo`) | Managed ContextOS provenance block | Verified in tests |
| **Aider** | Aider 0.70+ | `.aider.conf.yml` | `.aider.conf.yml`, `CONVENTIONS.md` | Read-only conventions via `read: CONVENTIONS.md` | Existing YAML keys preserved; managed CONVENTIONS.md | Verified in tests |
| **Zed** | Zed IDE 0.170+ | `.zed/rules.md` | `.zed/rules.md`, `.zed/prompts/*.md` | Project instructions and on-demand slash prompts | Managed rules header; prompt templates | Verified in tests |
| **Antigravity** | Antigravity IDE & CLI | Isolated | Defers to `GEMINI.md` and `.agents/skills/` | Workspace skill discovery | Internal `.agents/rules/` strictly isolated from IDE | Verified in tests |

---

## 2. Technical Contracts by Adapter

### 2.1 Cursor (.cursor/rules/*.mdc)
- **Official Specification**: [Cursor Rules Documentation](https://cursor.com/docs/rules)
- **Generator ID**: `cursor@2`
- **Output Artifacts**:
  - `.cursor/rules/00-project-rules.mdc` (contains root project rules and engineering workflow).
  - `.cursor/rules/<skill-name>.mdc` (modular rule per active skill).
  - `.cursorrules` (legacy single-file format, emitted only if legacy file pre-exists or requested).
- **MDC Contract**:
  - Frontmatter must include:
    - `description`: Single-line summary of what the rule enforces.
    - `globs`: Comma-separated glob patterns (e.g. `**/*.{tsx,jsx}`).
    - `alwaysApply`: Boolean (`true` for core governance skills: `engineering-workflow`, `gstack-roles`, `ponytail-mindset`, `gemini-precision`).
- **Preservation Policy**:
  - User-created `.cursor/rules/*.mdc` without ContextOS provenance headers are classified as unmanaged and NEVER overwritten or deleted by drift detection.

### 2.2 Claude Code (CLAUDE.md)
- **Official Specification**: [Claude Code Memory & Instructions](https://code.claude.com/docs/en/memory)
- **Generator ID**: `claude@2`
- **Output Artifacts**:
  - `CLAUDE.md` (project root entrypoint).
  - `.agents/generated/claude/skills/<skill-name>/SKILL.md` (clean markdown skill specifications stripped of YAML frontmatter).
- **Memory Contract**:
  - Claude Code automatically ingests `CLAUDE.md` on startup.
  - `CLAUDE.md` must link to active skills using clean relative paths so Claude can read them on demand.
- **Preservation Policy**:
  - If a user-authored `CLAUDE.md` already exists, ContextOS demarcates its managed section with `<!-- CONTEXTOS:START -->` and `<!-- CONTEXTOS:END -->` tags, preserving all user-authored preamble, build instructions, and custom guidelines.

### 2.3 Gemini CLI (GEMINI.md)
- **Official Specification**: [Gemini Context & Instructions](https://geminicli.com/docs/cli/gemini-md/)
- **Generator ID**: `gemini@2`
- **Output Artifacts**:
  - `.agents/skills/<skill-name>/SKILL.md` (native skill directory loaded by Gemini CLI).
  - `.agents/generated/gemini/skills/<skill-name>/SKILL.md`.
  - `GEMINI.md` (project root behavioral rules and persona definition).
- **Contract**:
  - Clean YAML frontmatter (`name`, `description`) with merged `EXAMPLES.md` and `TROUBLESHOOTING.md`.
- **Preservation Policy**:
  - User-authored custom sections in `GEMINI.md` are preserved.

### 2.4 GitHub Copilot (.github/copilot-instructions.md)
- **Official Specification**: [GitHub Copilot Custom Instructions](https://docs.github.com/en/copilot/reference/custom-instructions-support)
- **Generator ID**: `copilot@2`
- **Output Artifacts**:
  - `.github/copilot-instructions.md`.
- **Contract**:
  - Markdown containing high-priority instructions loaded into every Copilot chat and inline code completion context.
- **Preservation Policy**:
  - Wrapped in provenance block headers. Pre-existing non-ContextOS instructions in `.github/copilot-instructions.md` are retained above or below the managed block.

### 2.5 Aider (.aider.conf.yml and CONVENTIONS.md)
- **Official Specification**: [Aider Conventions](https://aider.chat/docs/usage/conventions.html)
- **Generator ID**: `aider@2`
- **Output Artifacts**:
  - `.aider.conf.yml` (configuration specifying `read: CONVENTIONS.md`).
  - `CONVENTIONS.md` (project conventions compiled from ContextOS rules and active skills).
- **Contract**:
  - Aider automatically loads `read:` files into its read-only context on session start.
- **Preservation Policy**:
  - Existing `.aider.conf.yml` settings (e.g. `model`, `editor`, `voice`) are merged non-destructively; only the `read: CONVENTIONS.md` setting is managed.

### 2.6 Zed IDE (.zed/rules.md and .zed/prompts/*.md)
- **Official Specification**: [Zed AI Instructions](https://zed.dev/docs/ai/instructions)
- **Generator ID**: `zed@2`
- **Output Artifacts**:
  - `.zed/rules.md` (project-wide instructions).
  - `.zed/prompts/<skill-name>.md` (slash-command prompt templates usable via `/<skill-name>`).
- **Contract**:
  - Zed loads `.zed/rules.md` for assistant interactions.
- **Preservation Policy**:
  - User prompts in `.zed/prompts/` not originating from ContextOS are preserved.

### 2.7 Google Antigravity IDE Assessment & Boundary Contract
- **Integration Architecture & Boundaries**:
  - Antigravity IDE and CLI look for project customizations in `.gemini/` or workspace rules.
  - Crucially, ContextOS internally reserves the `.agents/rules/` directory for its internal rule catalog engine (`.agents/rules/rule-catalog.js`).
  - **Decision**: ContextOS will NOT generate files inside `.agents/rules/` for external consumption. Instead, Antigravity IDE relies on `GEMINI.md` at root and `.agents/skills/` (the native skill hierarchy that Antigravity natively discovers via the Google Customization standard).
  - This avoids namespace collision and maintains zero ambiguity between ContextOS internals and IDE workspace rules.

---

## 3. Cross-Adapter Coexistence & Collision Avoidance

When multiple adapters are exported simultaneously (`contextos export all`):
1. **Target Disjointness**: Each adapter generates files in distinct, isolated paths:
   - Cursor: `.cursor/rules/*.mdc`
   - Claude: `CLAUDE.md`, `.agents/generated/claude/`
   - Gemini: `GEMINI.md`, `.agents/skills/`, `.agents/generated/gemini/`
   - Copilot: `.github/copilot-instructions.md`
   - Aider: `.aider.conf.yml`, `CONVENTIONS.md`
   - Zed: `.zed/rules.md`, `.zed/prompts/*.md`
2. **Collision Detector**: `pure-compiler.js` runs path collision detection across all active adapters. If any two adapters attempt to write to the same path with conflicting content, the compilation aborts with code 2.
3. **Lockfile Tracking**: Every generated artifact is recorded in `.agents/lockfile.v2.json` with its specific generator ID (e.g. `cursor@2`, `claude@2`). Drift detector inspects only the generators corresponding to the requested verification target.

---

## 4. Verification Protocol

1. **Unit & Structural Verification**: `node --test tests/adapter-safety.test.js tests/pure-adapters.test.js tests/adapter-compatibility.test.js`.
2. **Byte Reproducibility**: Compiling twice from the same source skills produces byte-identical artifacts.
3. **Platform Normalization**: Cross-platform checkouts with CRLF line endings are normalized to LF during hash comparisons, eliminating platform drift.
