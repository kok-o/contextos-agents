# Gemini execution troubleshooting

- A test fails: inspect the assertion and actual caller behavior, fix the root
  cause, and rerun relevant checks.
- A scan misses a stub: placeholder checks require --placeholders; scope checks
  require --scope <file>. Use an actual staged candidate for a staged scan.
- Scope grows: inspect callers, explain necessary additions, preserve unrelated
  formatting and local changes.
- Context drifts: keep a short persistent plan for substantial work and update
  it as evidence changes.
- Typography preference differs: follow the user's or repository's style; this
  skill does not define a universal ban on Unicode punctuation.
