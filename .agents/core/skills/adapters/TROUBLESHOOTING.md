# adapters Troubleshooting & Common Mistakes

## 1. Overwriting Custom Configs

- **Symptom**: Custom non-ContextOS rules wiped out during export.
- **Root Cause**: Running export with force flags over unmanaged files.
- **Fix**: Keep custom project overrides in dedicated config files or use plugin skills.
