# ContextOS Adapter Compatibility Matrix & Technical Contracts

This document records what each adapter writes and, separately, what has been
verified about it. Three claims are easy to confuse and are kept apart here:

- **(a) The file is correct.** The adapter writes the documented path with
  documented content. Checked by this repository's unit and installed-package tests.
- **(b) The client loaded it.** A real client version picked the file up.
- **(c) The model followed it.** The model's behavior reflected the instruction.

Passing (a) says nothing about (b) or (c).

## Verification record

The current core candidate is **3.0.0-rc.1 (unpublished)**. File-contract tests
are separate from real client loading and model adherence; older client records
below are historical observations, not fresh RC acceptance. MCP is excluded.

| Client | Output | (a) File contract | (b) Client loaded | (c) Model followed |
| --- | --- | --- | --- | --- |
| Claude Code | `.claude/rules/*.md`, `.claude/skills/*/SKILL.md` | Tested | **Skill discovery observed once:** a Claude Code session in this repository listed the seven exported `.claude/skills` by name and description (24 October 2026, client version not recorded). Skill body loading and `.claude/rules` loading not checked. Anthropic documents both locations ([memory](https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/), [skills](https://code.claude.com/docs/en/skills)). | Not verified |
| Cursor | `.cursor/rules/*.mdc` | Tested | Not verified | Not verified |
| GitHub Copilot | `.github/copilot-instructions.md` | Tested | Not verified | Not verified |
| Aider | `CONVENTIONS.md`, `.aider.conf.yml` | Tested | Not verified | Not verified |
| Zed | `.zed/rules.md`, `.zed/prompts/*.md` | Tested | Manual import only | Not verified |
| Codex CLI | `.agents/skills/*/SKILL.md` | Tested | Explicit activation and automatic selection recorded once each (CLI 0.149.1 with a `skill.yaml` fixture; explicit activation again in 0.159.2). Earlier layout, same output path. | Marker adherence recorded once for explicit activation (0.159.2) |
| Gemini CLI, Antigravity | `.agents/skills/*/SKILL.md` | Tested | Not verified | Not verified |

The Codex records are in [docs/evidence/](evidence/) and the
[archived release records](archive/README.md); each condition ran once, so they
show that loading is possible, not that it is reliable. For the current Claude
Code layout only skill discovery has been observed, once. Until the protocol
below has been run, treat (b) and (c) as open for every client except these
single records.

### How to verify a client yourself

1. Add a rule whose body contains an unmistakable marker instruction, for example
   "end every answer with the word MAGENTA-7", with `activation: always`. Export.
2. In a fresh session of the client, without naming the file, ask an unrelated
   question. Record whether the marker appears (this tests (b) and (c) together).
3. Ask the client to list the instructions it has loaded, if it can, to separate
   (b) from (c).
4. Repeat in at least five fresh sessions per client and rule type
   (`always`, `globs` with a matching and a non-matching file, `auto`).
5. Record client version, model, prompt and raw output. Report n of 5, not "works".

---

## 1. Supported Adapters & Contract Overview

| Adapter | Product Target | Primary Output | Scoping Mechanism | Custom User Content Preservation |
| --- | --- | --- | --- | --- |
| **Claude Code** | Claude Code | `.claude/rules/<name>.md`, `.claude/skills/<name>/SKILL.md` | `activation: always` loads at launch; `globs` writes `paths:`; `auto` is a skill selected from its description | `CLAUDE.md` is never rewritten; a block from an earlier version is removed, your text stays |
| **Cursor** | Cursor | `.cursor/rules/*.mdc` | `alwaysApply`, `globs`, agent-requested | User-owned or modified generated files refuse overwrite |
| **GitHub Copilot** | Copilot | `.github/copilot-instructions.md` | `always` bodies are inlined; other rules are listed with their source path | Managed block; text outside it is yours and never causes drift |
| **Aider** | Aider | `.aider.conf.yml`, `CONVENTIONS.md` | `read: CONVENTIONS.md`; `always` bodies are inlined | YAML values merged; `CONVENTIONS.md` refused unless ContextOS wrote it |
| **Zed** | Manual templates | `.zed/rules.md`, `.zed/prompts/*.md` | Manual import; `always` bodies are inlined in `rules.md` | Generated files protected |
| **Codex, Gemini CLI** | Native skill discovery | `.agents/skills/*/SKILL.md` | Skills selected from their description | Modified generated artifacts refuse overwrite; a root `AGENTS.md` or `GEMINI.md` is untouched |

Export only ever replaces files that ContextOS wrote (recorded in the lockfile
and unchanged since). `export --force` replaces a differing file at a generated
path explicitly.

Bundled engineering rules (`.agents/AGENTS.md`, installed by `init --with-core`)
are included in the Cursor, Aider, Zed and Copilot outputs only when the project
has them. Antigravity compatibility has not been independently verified.

### Activation

A rule states how it should reach the agent in its frontmatter (or `skill.yaml`):

```yaml
activation: always   # always | auto | globs   (default: auto)
globs: "src/api/**/*.ts,src/routes/**/*.ts"   # required for activation: globs
```

Without either field, catalog skills with a known path scope are `globs`, and
everything else is `auto`. An unknown value or `globs` without a list stops the
export and names the rule.

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

### 2.2 Claude Code (.claude/rules and .claude/skills)

- **Official Specification**: [Claude Code memory and rules](https://code.claude.com/docs/en/memory), [skills](https://code.claude.com/docs/en/skills)
- **Generator ID**: `claude@2`
- **Output Artifacts**:
  - `.claude/rules/<skill-name>.md` for `activation: always` (no frontmatter) and `globs` (`paths:` frontmatter).
  - `.claude/skills/<skill-name>/SKILL.md` for `auto`, with `name` and `description` frontmatter and declared resources beside it.
- **Contract**:
  - Rules without `paths` are documented to load at launch; path-scoped rules load when matching files are read. Skills expose their name and description and load the body when relevant. Declared resources are not copied beside rule files, because every `.md` under `.claude/rules/` is loaded as a rule.
  - Earlier versions wrote a managed block of plain links to `CLAUDE.md` and copies under `.agents/generated/claude/`. Ordinary Markdown links are not imports, so the model had to decide to open them. The next export removes both.
- **Preservation Policy**:
  - `CLAUDE.md` is never written. If a block from an earlier version exists, export removes only the block; the file is deleted only if nothing else is in it.

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
activation in CLI 0.159.2. The later maintenance record at the top of this
document adds one manifest-backed automatic scenario; Cursor activation and
manifestless live routing remain unverified. See [recorded results](BENCHMARK_RESULTS.md).

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
   - Claude: `.claude/rules/`, `.claude/skills/`
   - Gemini and Codex: `.agents/skills/`, `.agents/generated/gemini/`
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
