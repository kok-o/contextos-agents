# Workspace evidence graph

WorkspaceGraphBuilder discovers package manifests, dependency names, internal
package links, language ecosystems, and known configuration files. The resolver
uses nearest-package evidence to avoid unrelated monorepo stack signals. The
graph is bounded and can report partial discovery.

This graph is not a source-symbol AST, a feature/task map, or an automatic loader
of sections from docs/PROJECT_GRAPH.md. Inspect source imports, callers, tests,
and existing project documents explicitly for code impact analysis. A supplied
Project Graph can help, but confirm its freshness against the current checkout.

Use resolve --json to inspect workspaceGraph evidence. There is no ctx graph
command. Do not promise automatic module-graph updates or a context YAML cache.
