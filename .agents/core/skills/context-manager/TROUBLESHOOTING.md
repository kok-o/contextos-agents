# context-manager Troubleshooting & Common Mistakes

## 1. Token Budget Blowout

- **Symptom**: Model performance drops significantly, losing earlier conversational context.
- **Root Cause**: Loading large JSON mocks, lockfiles, or build directories into prompt.
- **Fix**: Never read package-lock.json, dist/, or build artifacts unless explicitly debugging bundle outputs.
