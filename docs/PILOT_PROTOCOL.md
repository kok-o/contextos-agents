# ContextOS pilot protocol

Status: prepared; no participants recruited and no pilot data collected.

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
