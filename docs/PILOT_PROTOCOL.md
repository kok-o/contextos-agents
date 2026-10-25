# ContextOS pilot protocol

Status: prepared; no participants recruited and no pilot data collected.

This protocol has two parts. The **adoption pilot** asks the question that
decides whether the project continues: does a real team keep using the tool?
The **task comparison** below it asks whether the rules change model results; it
is optional and costs model usage.

## Adoption pilot

**Who:** three to five teams, each with at least two coding agents in use and at
least three developers, recruited only after the maintainer authorizes contact.
Teams that already keep one `AGENTS.md` and are content with it are valid
participants too: they show where the simple approach is enough.

**What each team does for three to four weeks:**

1. Installs a pinned `contextos-agents`, runs `init`, moves the rules they
   already have into `.agents/project/skills/` with the activation they want,
   exports, and commits the result.
2. Adds the CI check (`export all --check`, or the gate action) to pull requests.
3. Works as usual. Nobody is asked to use any feature.

**What is recorded** (counts with their denominators, no private code):

| Measure | Why it matters |
| --- | --- |
| Pull requests that changed rules, and how many the check failed | Whether staleness happens at all |
| Of those failures, how many were real (a forgotten export) and how many false alarms | Whether the check is trusted |
| Merge conflicts in generated files and the minutes spent resolving them | Whether the merge design holds in practice |
| Rules edited directly in a generated file instead of the source | Whether the source/output split is understood |
| Clients each developer used, and whether the rule reached them (use the verification protocol in the [compatibility matrix](ADAPTER_COMPATIBILITY.md#verification-record)) | Whether the exports do anything |
| Whether the team still runs the check after the period, and, if not, the stated reason | The decision signal |

**Decision rule, fixed in advance:** fewer than two teams still using it after the
period means the product is cut down to the check on top of existing formats, or
stopped. Two or more means the next work is whatever those teams report as their
most frequent problem. Report the numbers, including every team that quit.

## Purpose and participants

Use 3–5 consenting teams for two weeks to test whether shared instructions are
useful in existing repositories. Recruit only after the user authorizes contact.
Record the client, version, model, task type, repository revision, and ContextOS
configuration. Keep private code and credentials out of shared reports.

## Setup

Install the candidate npm archive into a disposable checkout first. Check init,
profile, export, drift detection, project overrides, updates, and uninstall.
Retain user-authored root instructions. Export Gemini for the shared native
`.agents/skills` directory used by Codex, or export Cursor for MDC rules.

Confirm native discovery and explicit skill activation separately. Record which
file the client read and the expected marker or rule it applied. A generated file
or skill metadata list alone does not prove body activation.

## Task comparison

Choose real maintenance and feature tasks before running any comparator. Use a
plain baseline, all installed entrypoints, and task-selected ContextOS context.
Rotate comparator order and use fresh sessions for independent comparisons.
Keep model settings and acceptance tests the same. Do not reuse an answer from
one comparator as input to another.

Use private behavioral tests or reviewer checks that are absent from the prompt.
Record failures, API errors, regressions, retries, instructions that were ignored,
and time spent repairing outputs. Check negative controls against the evaluator
before using its success numbers.

## Daily record

```json
{
  "teamId": "anonymous-team-1",
  "taskId": "task-001",
  "taskType": "maintenance",
  "arm": "focused",
  "client": "client name and version",
  "model": "exact model version",
  "repositoryRevision": "commit or fixture hash",
  "contextHash": "sha256",
  "loadedSkillFiles": [],
  "acceptancePassed": null,
  "regressions": null,
  "repairMinutes": null,
  "providerInputTokens": null,
  "providerCachedInputTokens": null,
  "providerOutputTokens": null,
  "providerReasoningTokens": null,
  "reportedCostUsd": null,
  "notes": ""
}
```

Unavailable telemetry stays null. Reasoning tokens are included in output billing
and must not be added a second time. Distinguish context estimates from provider
usage and token cost from development time.

## Decision after two weeks

Report completion and regression counts with their denominators, paired task
comparisons, observed costs, repair time, and qualitative onboarding problems.
Discuss uncertainty and differences between teams. Do not generalize this small
pilot to every model, client, or repository. Recommend continuing, revising, or
stopping based on observed problems and benefit.
