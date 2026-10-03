# gemini-precision Troubleshooting & Common Failure Modes

## 1. Test Failure Investigation (No Guesswork)

- **Symptom**: Test fails during `npm test` after code modifications.
- **Root Cause**: Trying to patch the code without reading the exact assertion diff.
- **Fix**: Never guess the fix. View the test file line where assertion failed, inspect expected vs actual output, and resolve the root discrepancy.

## 2. Accidental Staged Secrets or Placeholders

- **Symptom**: `contextos scan --staged --enforce` fails with exit code 1.
- **Root Cause**: Committed temporary `.env` file or left an unfinished `// TODO: implement later` stub in added lines.
- **Fix**: Remove or redact the secret before committing. Fully implement the logic or replace the placeholder with an explicit tracked issue rather than committed code stubs.

## 3. Scope Creep and Excessive Blast Radius

- **Symptom**: Unrelated files reformatted or imports reordered across the repository.
- **Root Cause**: Full-file rewrite instead of targeted surgical replacement.
- **Fix**: Use targeted chunks that touch only the lines specified in the task plan. Avoid modifying unrelated styling or formatting.

## 4. Forbidden Long Dashes

- **Symptom**: Linter or compliance check flags unicode dashes in text.
- **Root Cause**: Using typography dashes (`\u2014` or `\u2013`) instead of standard ASCII hyphens.
- **Fix**: Replace all em-dashes and en-dashes with standard ASCII hyphens (` - `) or appropriate punctuation (parentheses, commas, colons).
