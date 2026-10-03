# Small ContextOS demo

Use this fixture in a new project to see a TypeScript task select a domain skill
and an explicit team rule. No model or paid API is needed.

From the repository root in PowerShell, after `npm run build` and
`npm pack --ignore-scripts`:

```powershell
$demo = Join-Path $env:TEMP ('contextos-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demo | Out-Null
Copy-Item -Recurse examples/quickstart/src $demo
$package = (Resolve-Path contextos-agents-2.3.0.tgz).Path
Push-Location $demo
try {
    npm.cmd init -y
    npm.cmd install --save-dev --ignore-scripts $package
    git init
    npx.cmd --no-install contextos init --minimal
    npx.cmd --no-install contextos skill add typescript
} finally { Pop-Location }
```

Copy `examples/quickstart/team-order` from this repository to
`$demo/.agents/project/skills/team-order` (create the parent directories).
Then, from `$demo`:

```powershell
npx.cmd --no-install contextos compile
npx.cmd --no-install contextos resolve "Implement @team-order TypeScript validation" --files src/order.ts --explain
npx.cmd --no-install contextos export all
npx.cmd --no-install contextos export all --check --json
```

The selection must contain `typescript` and `team-order`. The team rule's generated
native entrypoint is `.agents/skills/team-order/SKILL.md`. Edit the source under
`.agents/project/skills/team-order`, then compile and export again. Drift checking
must exit zero after a fresh export.

The `2.3.0` tarball above is the current local candidate, not a claim about an npm
release. The installed-consumer CI gate copies this same fixture and verifies
selection, projection, update preservation, drift, and uninstall preservation.

Opening a compatible client is a separate step: give it a task referencing
`$team-order`, then inspect its skill-loading evidence and resulting patch.
Selection and export alone do not prove that a model followed the rule.
