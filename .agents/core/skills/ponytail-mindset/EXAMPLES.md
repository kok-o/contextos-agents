# Minimalism examples

- Formatting: use Intl.DateTimeFormat, Intl.RelativeTimeFormat, or the existing
  formatter after verifying locale, timezone, invalid-date, and rounding needs.
  A snippet's length is not a measured bundle or accuracy guarantee.
- UI: reuse the installed component library when it meets accessibility and
  interaction requirements. Use a native control when it meets those requirements.
- Protected writes: see the executable updater in
  [references/minimalism.md](references/minimalism.md). Copying arbitrary payload
  fields into persistence does not satisfy minimalism or security.
- Refactoring: a small named function can be clearer than repeated inline logic,
  even before its third use.
