# Workflow troubleshooting

- Missing material requirement: inspect existing conventions, then ask for the
  remaining decision. Existing implementation authorization remains valid.
- Scope growth: inspect why the caller must change, update the scoped plan, and
  preserve unrelated edits. Do not restrict a necessary fix to an obsolete list.
- Unverified completion: run relevant behavior checks or report what remains
  unverified. A passing document validator is not implementation evidence.
- Excess ceremony: use the routine fast track for a typo, formatter, or diagnostic.
- Failed gate: read the actual failure; distinguish introduced regressions from
  pre-existing failures instead of silently dropping the gate.
