# ui-design Troubleshooting & Common Mistakes

## 1. Z-Index Chaos

- **Symptom**: Tooltips rendered underneath dialog overlays, or dropdowns hidden behind sticky headers.
- **Root Cause**: Ad-hoc hardcoded values (z-50, z-[999], z-[9999]).
- **Fix**: Use Radix / shadcn Portals for floating elements so they render at root DOM level, or declare strict z-index tokens.

## 2. Inconsistent Component States

- **Symptom**: Buttons have hover states but lack focus-visible rings or disabled states.
- **Root Cause**: Styling only the default and hover states.
- **Fix**: Standardize state matrices for every interactive element: default, hover, focus-visible, active, disabled, loading.

## 3. Ignoring Empty and Error Component States

- **Symptom**: Tables or list views show a blank white box when there are 0 records.
- **Root Cause**: Developers only design for the "ideal data" case.
- **Fix**: Every data component must explicitly render designed EmptyState and ErrorState fallbacks.
