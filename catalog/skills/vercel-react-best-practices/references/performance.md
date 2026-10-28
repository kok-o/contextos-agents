# Performance investigation cases

## Requests and streaming

For each awaited operation, identify its inputs and authorization dependency.
Independent reads can overlap; a mutation followed by a read of its result
cannot. Preserve cancellation, partial-failure handling and request limits.
Place streaming boundaries around useful independent content, rather than
making every component a separate loading surface.

## Bundles and boundaries

Inspect a production bundle report before changing an import strategy. An
interactive leaf does not require its entire parent tree to be a client module.
Defer expensive optional UI using the installed framework's supported API;
account for loading, failure, keyboard focus and server-rendering behavior.

## Cache identity

A cache key must include every input affecting the result, including tenant or
user identity for personalized data. Decide whether values are request-scoped,
shared, private or intentionally uncached. Test two users and invalidation after
a relevant write. Do not assume a module-level Map is a safe shared cache.

## Rendering and responsiveness

Use a React profile to identify repeated commits or expensive subtrees. Keep
input updates responsive; consider deferred non-urgent derived work only when
appropriate. A transition does not make synchronous CPU work inexpensive.
Use virtualization when actual list cost justifies its focus and measurement
complexity. Test keyboard navigation and dynamic row content.

## Evidence

Record route, input data, build mode, device/throttling and measurement method.
Compare several equivalent runs when timing is variable. A smaller bundle,
fewer commits and lower interaction latency are distinct observations.

Read the [upstream guide](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
for individual patterns, checking APIs against the project's installed versions.
