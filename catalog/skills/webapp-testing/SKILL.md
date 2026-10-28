---
name: webapp-testing
description: "Verify local web application flows in a browser with Playwright, including assertions, screenshots, console errors and responsive states."
license: Apache-2.0; see LICENSE.txt
---

# Test a local web application

## Overview

Turn a user flow or reported UI bug into reproducible browser evidence. This
ContextOS adaptation references Anthropic's webapp-testing skill; see
[source provenance](SOURCES.json) and [license](LICENSE.txt).

## When to Use

Verify a local site, reproduce a browser-only failure, inspect responsive states,
or check a frontend change in Playwright. Use the environment's supported browser
tools and the project's test runner; this skill does not override tool-access
restrictions or require one programming language.

## Rules & Patterns

Inspect existing scripts, Playwright configuration and the target route. Define
the expected result and important failure path. Use an already running local
server when appropriate; otherwise start the project's documented command and
wait for a bounded readiness signal. Track processes started for this task and
clean them up without stopping unrelated services.

Inspect rendered elements and use stable role/name/label locators. Rely on
Playwright's auto-waiting and web-first assertions for the actual state. Do not
use fixed sleeps or networkidle as a universal readiness requirement: polling,
analytics or streaming may remain active while the tested UI is ready.

Exercise the real interaction and assert its visible result. Check a relevant
error/empty case, keyboard focus, narrow viewport or reduced-motion mode when
the change affects it. Collect console/page errors and useful screenshots or
traces. A screenshot confirms appearance in that capture, not the success of an
unasserted interaction or complete accessibility.

Use deterministic local test data. Keep credentials and private data out of
screenshots, traces and logs. Use test accounts for state-changing flows; existing
authorization and environment boundaries govern any external side effect.

## Code Examples

For a settings form, fill controls by label, submit by role/name and assert both
the saved state and the failure message for a controlled rejected save. See
[references/playwright.md](references/playwright.md) for a minimal test pattern
and its prerequisites; no helper script is assumed to exist in this skill.

## Validation Checklist

- Record command, route, browser, viewport and actual assertions.
- Report failed checks, unexpected console errors and relevant artifacts.
- Distinguish real backend coverage from a controlled mock and disclose browser
  or platform gaps. Close task-owned browser/server resources.

## Common Mistakes

Guessing selectors; only taking screenshots; replacing assertions with sleeps;
hiding console failures; testing a mock and claiming the real integration works.

## Integration Notes

Reuse installed Playwright and project fixtures. Installing browser binaries or
changing test configuration is an implementation choice, not an automatic effect
of loading this skill. No browser compatibility matrix is implied by one run.
