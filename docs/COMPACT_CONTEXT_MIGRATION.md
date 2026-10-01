# Compact context migration: 2.3.0 / MCP 0.4.0 candidates

These versions are local release candidates. They have not been published.

## Behavioral changes

The project bootstrap is shorter. Cursor always applies only
`00-project-rules.mdc`; other skills use their file patterns or agent request.
Workflow, roles, and minimal implementation instructions link to declared
references instead of injecting those manuals into every task.

Routine documentation tasks select the short workflow. Substantive Build tasks
can also select minimal implementation guidance. Security remains required for
security, migration, and destructive risk, even if a profile excludes it or a
soft budget is too small. Warnings explain those conflicts and overflows.

The experimental MCP loader preserves whole selected bodies and project overrides.
It exposes paths, SHA-256 hashes, sizes, warnings, and selection omissions through
`assembleContextPrompt` and delegation's `context_report`. `buildContextPrompt`
remains a string-returning wrapper. `maxTotalSkillsChars` is now a soft limit;
use `hardLimitChars` to reject an oversized complete prompt. Missing selected
sources fail explicitly. Install required catalog skills before runtime assembly.

The root resolver retains compatibility skill IDs and reports missing installed
manifests. Selection alone does not prove that a body has been loaded. Client
instructions and chat history are outside this skill-body budget.

## Upgrade

1. Save or commit your existing instructions and inspect local modifications.
2. Install the candidate archive into a disposable checkout.
3. Run the normal ContextOS update, compile, validate, and export commands.
4. Inspect the diff. Modified managed files refuse replacement; put intended
   customization in project overrides instead of editing generated artifacts.
5. Confirm that user-authored root instructions remain intact and references exist.
6. Check native metadata discovery and a relevant skill activation in the client.
7. Run your repository's normal acceptance checks before adopting the candidate.

Codex discovers the shared `.agents/skills` projection from the Gemini export.
ContextOS leaves user-managed root `AGENTS.md` untouched. Native Codex metadata
discovery is checked locally; full skill activation and Cursor behavior still
require client interaction.

## Budgeted model comparison

Run `benchmarks/run-budgeted-openai.ps1` from PowerShell for masked API-key input,
or use `-PreflightOnly` without any credentials. The runner fixes the official
OpenAI endpoint and model snapshot, reserves estimated worst-case spend before
each request, disables automatic retries, and keeps a persistent $10 ledger.
Unknown request costs retain their reservation. Other use of the API project is
outside this runner's limit.

The protocol compares six tasks, three context modes, and three repetitions.
Results remain a small fixed-model experiment. They do not establish universal
quality improvement or savings for long client sessions.
