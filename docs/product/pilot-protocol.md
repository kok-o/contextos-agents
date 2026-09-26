# ContextOS Pilot Program: Evaluation Protocol

This protocol defines the formal validation process for testing ContextOS across 3 to 5 real-world repositories prior to the final v2.1.0 stable release.

---

## 1. Objectives and Acceptance Standards

The goal of the pilot is to prove that ContextOS delivers deterministic context governance, protects user files from accidental corruption, and operates without false positive blocks during daily engineering workflows.

### Minimum Pilot Criteria for Stable Release

1. **3 distinct project topologies evaluated**:
   - Topology A: Full-stack Node.js / TypeScript repository.
   - Topology B: Non-Node service repository (Python, Go, Rust, or C++ with no `package.json`).
   - Topology C: Repository with pre-existing AI tool configuration files (`.cursorrules`, `CLAUDE.md`, `.aider.conf.yml`).
2. **Participant Diversity**: At least two independent software engineers, including at least one engineer who is not an author or maintainer of ContextOS.
3. **Zero Data Loss Guarantee**: 0 incidents of unprompted file overwrites, deleted custom skills, or corrupted editor configurations.
4. **100% Deterministic Drift Detection**: All injected drifts in managed outputs must be correctly detected and flagged with actionable remediation commands.

---

## 2. Participant Onboarding Protocol

For each pilot repository, the participant executes the following structured workflow:

### Step 1: Baseline Telemetry Capture

Document repository properties before running any ContextOS commands:
- Repository name / domain.
- Primary programming languages and build tools.
- Operating system (Linux / macOS / Windows) and Node.js version.
- AI assistant tools used by the team (Cursor, Claude Code, GitHub Copilot, Gemini CLI, Aider, Zed).
- Pre-existing AI configuration files present before ContextOS initialization.

### Step 2: Fresh Installation via Onboarding Guide

1. Follow [ContextOS Quickstart Onboarding](./onboarding.md).
2. Run `npx contextos-agents init --auto` (or `--minimal`).
3. Record:
   - Initial install duration (seconds).
   - Any warnings or unexpected CLI output.
   - Initial `contextos.lock.json` and `.agents/` file tree integrity.

### Step 3: Authoring Custom Rules and Compilation

1. Author a repository-specific rule under `.agents/core/skills/<name>/SKILL.md`.
2. Compile across chosen editor targets:
   ```sh
   npx contextos-agents export all
   ```
3. Run local quality gate verification:
   ```sh
   npx contextos-agents gate
   ```
4. Verify that status reports `PASS` (exit code 0).

### Step 4: Synthetic Drift Induction and Remediation

1. Manually edit one managed output file (e.g. modify a line in `.cursor/rules/*.mdc` or `.github/copilot-instructions.md`).
2. Run `npx contextos-agents gate`:
   - Must fail with exit code 1 (`DRIFT`).
   - Must output the exact path of the mutated file.
   - Must print the exact remediation command (`contextos export`).
3. Execute the remediation command:
   ```sh
   npx contextos-agents export all
   ```
4. Re-run `npx contextos-agents gate`:
   - Must return exit code 0 (`PASS`).

### Step 5: Source Mutation Cycle

1. Modify the source `SKILL.md` file in `.agents/`.
2. Run `npx contextos-agents gate`:
   - Must detect stale outputs (exit code 1).
3. Re-export and confirm clean resolution.

### Step 6: Daily Workflow Validation

1. Open the project in the participant's primary AI editor (Cursor, Claude Code, etc.).
2. Execute a typical development task (e.g. implementing a utility or endpoint).
3. Confirm that the AI agent recognizes and respects the rules declared in ContextOS.

### Step 7: Incident and Usability Logging

Record any of the following occurrences:
- Any confusing CLI help messages or prompts.
- Any false positive gate rejections.
- Any conflict with personal or workspace editor preferences.
- Any execution performance latency > 500ms for `contextos gate`.

### Step 8: Longitudinal Retention Check (Day 5 to Day 10)

After 5 to 10 working days, check in with the repository owner:
- Has the CI quality gate remained enabled in GitHub Actions?
- If disabled, what was the primary blocker or friction point?
- What features or adaptations are recommended for stable v2.1.0?
