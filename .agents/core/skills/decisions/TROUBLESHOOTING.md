# decisions Troubleshooting & Common Mistakes

## 1. Post-Hoc Justifications

- **Symptom**: ADR written weeks after code is merged, omitting all rejected options.
- **Root Cause**: Treating ADRs as paperwork rather than decision-making tools.
- **Fix**: Write the ADR during the PLAN phase _before_ implementing the decision.

## 2. Omitting Trade-offs

- **Symptom**: ADR lists only benefits, claiming the chosen tech has zero downsides.
- **Root Cause**: Confirmation bias.
- **Fix**: Every architecture decision has costs. Explicitly document negative trade-offs and operational overhead.
