# ux-design Troubleshooting & Common Mistakes

## 1. Mystery Meat Navigation

- **Symptom**: Users don't know what icons do and have to hover to guess.
- **Root Cause**: Relying on ambiguous icons without text labels or tooltips.
- **Fix**: Pair icons with text labels wherever space permits; always provide accessible tooltips on icon-only actions.

## 2. Loss of User Input on Interruption

- **Symptom**: User accidentally clicks outside a long modal form and all typed content vanishes.
- **Root Cause**: Modals closing on backdrop click without checking form dirty state.
- **Fix**: Prevent dismiss on outside click when form has unsaved modifications, or autosave drafts to local storage.

## 3. Double-Click Submission Bugs

- **Symptom**: Users double-click a submit button on slow network, resulting in duplicate charges or items.
- **Root Cause**: Form buttons remaining active during in-flight network requests.
- **Fix**: Disable button and show spinner state as soon as form submission begins.
