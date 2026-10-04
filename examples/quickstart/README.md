# Small ContextOS demo

Use this fixture in a new project to see a TypeScript task select a domain skill
and an explicit team rule. No model or paid API is needed.

## Public Quickstart (Recommended via npm)

From PowerShell, create a temporary demo workspace and install the published package:

```powershell
$demo = Join-Path $env:TEMP ('contextos-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demo | Out-Null
Copy-Item -Recurse examples/quickstart/src $demo
Push-Location $demo
try {
    npm.cmd init -y
    npm.cmd install --save-dev contextos-agents
    git init
    npx.cmd contextos init --minimal
    npx.cmd contextos skill add typescript
} finally { Pop-Location }
```

On Linux or macOS (bash):

```bash
demo="$(mktemp -d -t contextos-demo-XXXXXX)"
cp -r examples/quickstart/src "$demo"
(
  cd "$demo"
  npm init -y
  npm install --save-dev contextos-agents
  git init
  npx contextos init --minimal
  npx contextos skill add typescript
)
```

## Alternative: Local Repository Checkout

If you are developing inside this repository and testing local changes:
Run `npm run build` and `npm pack --ignore-scripts` from the root, then install
the generated tarball:

```powershell
$package = (Resolve-Path (Get-ChildItem contextos-agents-*.tgz | Select-Object -Last 1)).Path
Push-Location $demo
try {
    npm.cmd init -y
    npm.cmd install --save-dev --ignore-scripts $package
    git init
    npx.cmd --no-install contextos init --minimal
    npx.cmd --no-install contextos skill add typescript
} finally { Pop-Location }
```

## Adding a Team Rule and Verifying Drift

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
native entrypoint is `.agents/skills/team-order/SKILL.md` (discovered natively by Codex
and Gemini). Edit the source under `.agents/project/skills/team-order`, then compile
and export again. Drift checking must exit zero after a fresh export.

The installed-consumer CI gate (`scripts/check-release-install.cjs`) copies this same
fixture and verifies selection, projection, update preservation, drift, and uninstall
preservation against release archives.

Opening a compatible client is a separate step: give it a task referencing
`$team-order`, then inspect its skill-loading evidence and resulting patch.
Selection and export alone do not prove that a model followed the rule.

