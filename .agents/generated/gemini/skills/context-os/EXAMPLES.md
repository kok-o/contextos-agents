# ContextOS command examples

## Source checkout

These commands run in the ContextOS source repository:

```powershell
node .agents/ctx.js resolve "Fix IDOR in document deletion" --files src/auth.ts --json
node .agents/ctx.js compile --check
node .agents/ctx.js validate
node .agents/ctx.js export all --check --json
```

After authorized edits to canonical sources, compile then export before checking
sync. export --check is read-only; export without --check writes managed outputs.
The resolver returns skills and package evidence, not an automatic code-file
context package.

## Consumer project

Use the installed local ContextOS executable, for example through npx when the
package is already installed. Do not assume a consumer has this repository's bin
or scripts directories. Inspect its installation and project-specific checks.
Create overrides through skill override, inspect skill diff, then compile/export.
Preserve unmanaged user files and existing overrides.

## Evidence interpretation

A validator pass means source/configuration checks passed. A scanner pass means
its specified staged checks passed. Neither result proves a live client loaded
instructions or a model followed them.
