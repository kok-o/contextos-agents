---
name: graphify
description: Build or inspect a bounded code dependency map using observed
  sources and available analyzers.
---

# graphify

## Overview

Build or inspect a bounded code dependency map using observed sources and available analyzers. Match guidance to the actual task and project; this document does not implement an automatic enforcer.

## When to Use

A dependency, caller, architecture or change-impact question benefits from a code map. Small searches can be answered directly without generating a graph.

## Rules & Patterns

Inspect available tools and existing graph artifacts before choosing a method. This skill is guidance; it does not install an AST analyzer or implement a graph command. Reuse a configured analyzer or use bounded source searches when none is available.

Identify nodes and edges with source locations, relation type and extraction method. Imports, calls, runtime requests and inferred relationships are different evidence. A text match is a navigation lead, not a verified call graph.

Record the revision/files and limitations needed to assess freshness. Check affected sources before trusting a stale graph. Centrality suggests inspection priorities; it does not prove that a module will break or that a change is safe.

Query only the needed neighborhood and summarize useful paths. Produce graph.json, a report or a visualization only when requested or useful to the task. Do not add hooks, stage files or install a remote analyzer just because the guide mentions one.

An external analyzer or optional MCP facility has its own installation, permissions and supported-language limits. Report unavailable or incomplete analysis rather than promising near-zero context cost or full dependency coverage.

## Code Examples

For a change to PaymentService, inspect known references and their import/call sites. Label reflection or dynamically loaded callers as unverified. A graph edge can narrow the search but does not establish which production path executed.

See [EXAMPLES.md](EXAMPLES.md) for scoped scenarios and evidence boundaries.

## Validation Checklist

- [ ] Trace a sample of reported relationships back to source locations.
- [ ] Record extraction method, freshness and unresolved dynamic behavior.

## Common Mistakes

Inventing graph commands; equating string matches with AST calls; auto-installing hooks; claiming a graph eliminates context cost.

## Integration Notes

Optional companion guidance: system-design, architecture-diagrams. Use it only when relevant and available; the skill does not install tools or authorize external actions.
