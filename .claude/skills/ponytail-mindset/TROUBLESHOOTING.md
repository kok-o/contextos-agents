# Minimalism troubleshooting

- A shorter patch removes validation: restore the boundary checks before comparing
  implementation sizes.
- A helper is used once: evaluate its meaning, isolation, and readability rather
  than automatically inlining it.
- A new dependency appears: inspect the existing stack and actual requirement.
- Retry behavior is assumed: check the SDK contract and test failure handling.
- A code example is illustrative: do not report a running integration until the
  real imports, persistence, authentication, and checks have been supplied.
