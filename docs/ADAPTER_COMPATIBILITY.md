# ContextOS Adapter Compatibility Matrix & Technical Contracts

This document records the export contracts for the ContextOS v2.3.0 release. Passing structural or consumer tests does not establish that every client version loads an artifact. Native loader acceptance must be recorded separately.

Release pair: core 2.3.0 / MCP 0.4.0. The [release manifest](evidence/release-2.3.json)
binds the released source and registry archives to Windows/Linux/macOS core Node 22/24,
MCP and installed lifecycle/migration acceptance. The earlier `4d633da` run is
historical evidence. Explicit Codex CLI 0.159.2 native activation
with GPT-6.1 Sol/high passed on 2 October; automatic routing, other live clients
and the external pilot remain unverified. See [calibration evidence](BENCHMARK_RESULTS.md)
and [R2 preparation](R2_RELEASE_PREPARATION.md).
MCP supports default read-only inspection within this release scope. Execution,
Python, crash recovery and concurrent runtime persistence are experimental;
the [skip inventory](MCP_SKIPPED_TESTS.md) records their coverage gaps.

---

## 1. Supported Adapters & Contract Overview

| Adapter | Product Target | Primary Entrypoint | Generated Output Files | Scoping Mechanism | Custom User Content Preservation | Verification Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Cursor** | Cursor | `.cursor/rules/*.mdc` | MDC rules | `globs`, `alwaysApply` | User-owned/modified generated files refuse overwrite | Structural/consumer tests; live client unverified |
| **Claude Code** | Claude Code | `CLAUDE.md` | Root index, `.agents/generated/claude/skills` and resources | Read linked instructions on demand; not native `.claude/skills` | Managed block preserves surrounding user text | Structural/consumer tests; native skills not provided |
| **Gemini CLI** | Gemini CLI | `.agents/skills/*/SKILL.md` | Skill entrypoints and declared resources | Documented workspace skills alias | Modified generated artifacts refuse overwrite | Structural/consumer tests; live client unverified |
| **GitHub Copilot** | Copilot | `.github/copilot-instructions.md` | Root instruction file | Shared instruction block and skill source index | Managed block preserves user text | Structural/consumer preservation tests |
| **Aider** | Aider | `.aider.conf.yml` | Config and CONVENTIONS.md | `read: CONVENTIONS.md` | YAML values merged; generated conventions protected | Structural/consumer idempotence tests |
| **Zed** | Manual templates | `.zed/rules.md` | Rules and prompt templates | Manual import; this rules path is not a documented native instruction entrypoint | Generated files protected | Structural tests; native loading unverified |
| **Codex** | Native skill discovery | `.agents/skills/*/SKILL.md` | Shared native skill projection from Gemini export | Metadata discovery; bodies read on activation | Existing root AGENTS.md untouched | Discovery 7/7; explicit body load and marker adherence PASS in CLI 0.159.2 with Sol/high; automatic routing unverified |

Default init exports Gemini skills. Ordinary export applies profile filtering to the installed skill set; it does not run task-specific resolution. Antigravity compatibility has not been independently verified.

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
    - `alwaysApply`: Boolean. Only `00-project-rules.mdc` is always applied by default; skill bodies use globs or agent-requested activation.
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

### 2.3 Gemini CLI (workspace skills)

- **Official Specification**: [Gemini Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- **Generator ID**: `gemini@2`
- **Output Artifacts**:
  - `.agents/skills/<skill-name>/SKILL.md` (native skill directory loaded by Gemini CLI).
  - `.agents/generated/gemini/skills/<skill-name>/SKILL.md`.
  - Declared supporting resources alongside each skill. No root `GEMINI.md` is generated.
- **Contract**:
  - Clean YAML frontmatter (`name`, `description`); examples, troubleshooting and references remain separate resources loaded on demand.
- **Preservation Policy**:
  - Existing root `GEMINI.md` is untouched. Generated skills are protected against overwriting local modifications; use project overrides for customization.

The same `.agents/skills` projection is discovered natively by Codex. The local
app-server `skills/list` check found all seven core skills without inference
requests. A later controlled `codex exec` probe confirmed full selected bodies in
the CLI payload without paid inference. These establish discovery and explicit
injection. A subsequent Sol/high probe verified marker adherence for explicit
activation in CLI 0.159.2; automatic routing and Cursor activation remain
unverified. See the [recorded results](BENCHMARK_RESULTS.md).

### 2.4 GitHub Copilot (.github/copilot-instructions.md)

- **Official Specification**: [GitHub Copilot Custom Instructions](https://docs.github.com/en/copilot/reference/custom-instructions-support)
- **Generator ID**: `copilot@2`
- **Output Artifacts**:
  - `.github/copilot-instructions.md`.
- **Contract**:
  - Markdown at the documented repository instruction path. Exact feature support depends on the Copilot client.
- **Preservation Policy**:
  - Managed START/END block; pre-existing user text is retained outside it. Malformed blocks fail safely. Hash preconditions protect changes made after rendering.

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
  - `.zed/prompts/<skill-name>.md` (Markdown templates for manual use).
- **Contract**:
  - These are export artifacts for manual use. Native Zed instructions use documented root files such as `AGENTS.md` or `.rules`; automatic loading of `.zed/rules.md` is not promised.
- **Preservation Policy**:
  - User prompts in `.zed/prompts/` not originating from ContextOS are preserved.

### 2.7 Google Antigravity IDE Assessment & Boundary Contract

- **Integration Architecture & Boundaries**:
  - Antigravity IDE and CLI look for project customizations in `.gemini/` or workspace rules.
  - Crucially, ContextOS internally reserves the `.agents/rules/` directory for its internal rule catalog engine (`.agents/rules/rule-catalog.js`).
  - **Decision**: ContextOS does not generate external consumer files in `.agents/rules/`. It exports workspace skills to `.agents/skills/`; Antigravity's actual loader behavior requires separate verification.
  - This avoids namespace collision and maintains zero ambiguity between ContextOS internals and IDE workspace rules.

---

## 3. Cross-Adapter Coexistence & Collision Avoidance

When multiple adapters are exported simultaneously (`contextos export all`):

1. **Target Disjointness**: Each adapter generates files in distinct, isolated paths:
   - Cursor: `.cursor/rules/*.mdc`
   - Claude: `CLAUDE.md`, `.agents/generated/claude/`
   - Gemini: `.agents/skills/`, `.agents/generated/gemini/`
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
