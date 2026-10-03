# context-os Troubleshooting & Common Mistakes

## 1. Stale Compiled Artifacts

- **Symptom**: Editor rules don't reflect newly updated skills.
- **Root Cause**: Modifying .agents/core/skills/ without recompiling exports.
- **Fix**: Run node .agents/ctx.js export all whenever source skills are updated.
